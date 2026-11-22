// Acesso à conta Resend de uma org: chave colada (api_key) ou OAuth ("Conectar com Resend").
// OAuth: acesso de 15 min renovado com chave de renovação que muda a cada uso — só uma rotina renova por
// vez (fn_email_oauth_try_lock); as outras esperam e usam o acesso novo. Nunca devolve segredo para a tela.
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { RESEND_API, resendRequest } from "./email-resend.ts";

// App "Seialz" registrado na Resend (cliente público, PKCE). O identificador não é segredo.
export const RESEND_OAUTH_CLIENT_ID = Deno.env.get("RESEND_OAUTH_CLIENT_ID") || "8305a64b-39b9-4ef7-bdc4-4226442be600";
export const RESEND_OAUTH_REDIRECT = `${Deno.env.get("SUPABASE_URL")}/functions/v1/resend-oauth-callback`;
export const RESEND_WEBHOOK_EVENTS = [
  "email.sent", "email.delivered", "email.delivery_delayed", "email.opened", "email.clicked",
  "email.bounced", "email.complained", "email.failed", "email.suppressed",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${RESEND_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as Record<string, any> };
}

/** Guarda os tokens OAuth criptografados e libera a trava. */
// deno-lint-ignore no-explicit-any
export async function storeOAuthTokens(admin: any, orgId: string, data: Record<string, any>) {
  const expiresIn = Number(data.expires_in) || 900;
  return await admin.from("organization_email_secrets").upsert({
    organization_id: orgId,
    auth_type: "oauth",
    api_key_encrypted: null,
    oauth_access_encrypted: await encryptSecret(String(data.access_token)),
    oauth_refresh_encrypted: await encryptSecret(String(data.refresh_token)),
    oauth_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refresh_lock_until: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
}

/**
 * Credencial para chamar a API da Resend em nome da org (Bearer). null = não conectada ou acesso perdido
 * (nesse caso a org fica com status "error" e o motivo na tela).
 */
// deno-lint-ignore no-explicit-any
export async function getResendAuth(admin: any, orgId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: s } = await admin.from("organization_email_secrets")
      .select("auth_type, api_key_encrypted, oauth_access_encrypted, oauth_refresh_encrypted, oauth_expires_at")
      .eq("organization_id", orgId).maybeSingle();
    if (!s) return null;
    try {
      if (s.auth_type !== "oauth") return s.api_key_encrypted ? await decryptSecret(s.api_key_encrypted) : null;
      if (s.oauth_access_encrypted && s.oauth_expires_at && new Date(s.oauth_expires_at).getTime() > Date.now() + 60_000) {
        return await decryptSecret(s.oauth_access_encrypted);
      }
    } catch {
      return null;
    }
    const { data: locked } = await admin.rpc("fn_email_oauth_try_lock", { p_org: orgId });
    if (!locked) { await sleep(1000); continue; } // outra rotina está renovando
    const refresh = await decryptSecret(s.oauth_refresh_encrypted ?? "").catch(() => "");
    const r = refresh
      ? await tokenRequest({ grant_type: "refresh_token", client_id: RESEND_OAUTH_CLIENT_ID, refresh_token: refresh })
      : { ok: false, status: 400, data: { error: "no_refresh_token" } };
    if (r.ok && r.data.access_token && r.data.refresh_token) {
      await storeOAuthTokens(admin, orgId, r.data);
      return String(r.data.access_token);
    }
    await admin.from("organization_email_secrets").update({ refresh_lock_until: null }).eq("organization_id", orgId);
    if (r.status === 400 || r.status === 401) {
      // Acesso revogado ou expirado: a org precisa conectar de novo.
      await admin.from("organization_email_settings").update({
        status: "error", last_error: "O acesso à Resend expirou ou foi revogado. Conecte de novo em Integrações → E-mail.",
        updated_at: new Date().toISOString(),
      }).eq("organization_id", orgId);
    }
    return null;
  }
  return null;
}

/**
 * Depois de conectar (chave ou OAuth): cria o aviso de retorno na conta da org com segredo próprio e marca a
 * conexão. Devolve os domínios da conta.
 */
// deno-lint-ignore no-explicit-any
export async function finishResendConnect(admin: any, orgId: string, token: string, method: "api_key" | "oauth", keyLast4: string | null, userId: string | null) {
  const { data: secretRow } = await admin.from("organization_email_secrets").select("webhook_token").eq("organization_id", orgId).single();
  const hook = await resendRequest(token, "POST", "/webhooks", {
    endpoint: `${Deno.env.get("SUPABASE_URL")}/functions/v1/resend-webhook?t=${secretRow.webhook_token}`,
    events: RESEND_WEBHOOK_EVENTS,
  });
  let webhookId: string | null = null;
  let lastError: string | null = null;
  if (hook.ok && hook.data?.signing_secret) {
    webhookId = String(hook.data.id ?? "");
    await admin.from("organization_email_secrets").update({
      webhook_secret_encrypted: await encryptSecret(String(hook.data.signing_secret)), updated_at: new Date().toISOString(),
    }).eq("organization_id", orgId);
  } else {
    lastError = "Não foi possível criar o aviso de retorno na Resend. Envios funcionam, mas sem entregue/aberto/devolvido.";
  }
  await admin.from("organization_email_settings").upsert({
    organization_id: orgId, provider: "resend", status: "connected", auth_method: method, key_last4: keyLast4,
    webhook_id: webhookId, last_error: lastError, connected_at: new Date().toISOString(), updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  const domains = await resendRequest(token, "GET", "/domains");
  return { webhook: !!webhookId, domains: ((domains.data?.data ?? []) as any[]).map((d) => ({ id: d.id, name: d.name, status: d.status })) };
}

/** Desfaz o aviso de retorno antigo e, no OAuth, revoga o acesso (melhor esforço). */
// deno-lint-ignore no-explicit-any
export async function teardownResend(admin: any, orgId: string) {
  const { data: settings } = await admin.from("organization_email_settings").select("webhook_id").eq("organization_id", orgId).maybeSingle();
  const token = await getResendAuth(admin, orgId).catch(() => null);
  if (settings?.webhook_id && token) await resendRequest(token, "DELETE", `/webhooks/${settings.webhook_id}`).catch(() => null);
  const { data: s } = await admin.from("organization_email_secrets").select("auth_type, oauth_refresh_encrypted").eq("organization_id", orgId).maybeSingle();
  if (s?.auth_type === "oauth" && s.oauth_refresh_encrypted) {
    const refresh = await decryptSecret(s.oauth_refresh_encrypted).catch(() => "");
    if (refresh) {
      await fetch(`${RESEND_API}/oauth/revoke`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refresh, token_type_hint: "refresh_token", client_id: RESEND_OAUTH_CLIENT_ID }).toString(),
      }).catch(() => null);
    }
  }
}

/** PKCE: verificador aleatório e o desafio S256 (base64url). */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}
