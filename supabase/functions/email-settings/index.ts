// Conexão do e-mail da organização com a conta Resend DELA (a org cola a própria chave).
// Só administrador da org (is_org_system_admin). A chave é testada, criptografada e nunca volta para a tela.
// Ações: connect, domains, add_domain, domain, verify_domain, set_sender, send_test, disconnect.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import { looksLikeEmail, renderEmail, resendRequest } from "../_shared/email-resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const WEBHOOK_EVENTS = [
  "email.sent", "email.delivered", "email.delivery_delayed", "email.opened", "email.clicked",
  "email.bounced", "email.complained", "email.failed", "email.suppressed",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const orgId = String(body.organization_id ?? "");
  const action = String(body.action ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return json({ error: "invalid_params" }, 400);

  // Quem chama: usuário logado e administrador da org (regra do banco, não pelo nome do perfil).
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "missing_bearer_token" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isAdmin, error: roleError } = await userClient.rpc("is_org_system_admin", { _org: orgId });
  if (roleError) return json({ error: "auth_failed" }, 401);
  if (!isAdmin) return json({ error: "not_org_admin" }, 403);
  const { data: me } = await userClient.rpc("current_user_id");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const saveSettings = (patch: Record<string, unknown>) =>
    admin.from("organization_email_settings").upsert(
      { organization_id: orgId, ...patch, updated_by: me ?? null, updated_at: new Date().toISOString() },
      { onConflict: "organization_id" },
    );
  const loadKey = async (): Promise<string | null> => {
    const { data } = await admin.from("organization_email_secrets").select("api_key_encrypted").eq("organization_id", orgId).maybeSingle();
    if (!data?.api_key_encrypted) return null;
    try { return await decryptSecret(data.api_key_encrypted); } catch { return null; }
  };

  if (action === "connect") {
    const apiKey = String(body.api_key ?? "").trim();
    if (!/^re_[A-Za-z0-9_]{10,}$/.test(apiKey)) return json({ error: "invalid_key_format" }, 400);
    const test = await resendRequest(apiKey, "GET", "/domains");
    if (!test.ok) return json({ error: test.status === 401 || test.status === 403 ? "key_rejected" : "resend_unavailable", status: test.status }, 400);

    let encrypted: string;
    try { encrypted = await encryptSecret(apiKey); } catch { return json({ error: "encryption_unavailable" }, 503); }

    // Desfaz o aviso de retorno da conexão anterior (melhor esforço) e cria um novo, com o segredo próprio.
    const { data: prevSettings } = await admin.from("organization_email_settings").select("webhook_id").eq("organization_id", orgId).maybeSingle();
    const prevKey = await loadKey();
    if (prevSettings?.webhook_id && prevKey) await resendRequest(prevKey, "DELETE", `/webhooks/${prevSettings.webhook_id}`).catch(() => null);

    const { data: secretRow, error: secretError } = await admin.from("organization_email_secrets")
      .upsert({ organization_id: orgId, api_key_encrypted: encrypted, updated_at: new Date().toISOString() }, { onConflict: "organization_id" })
      .select("webhook_token").single();
    if (secretError) return json({ error: "save_failed" }, 500);

    const hook = await resendRequest(apiKey, "POST", "/webhooks", {
      endpoint: `${SUPABASE_URL}/functions/v1/resend-webhook?t=${secretRow.webhook_token}`,
      events: WEBHOOK_EVENTS,
    });
    let webhookId: string | null = null;
    let lastError: string | null = null;
    if (hook.ok && hook.data?.signing_secret) {
      webhookId = String(hook.data.id ?? "");
      await admin.from("organization_email_secrets").update({
        webhook_secret_encrypted: await encryptSecret(String(hook.data.signing_secret)), updated_at: new Date().toISOString(),
      }).eq("organization_id", orgId);
    } else {
      lastError = "Não foi possível criar o aviso de retorno na Resend (a chave precisa de acesso total). Envios funcionam, mas sem entregue/aberto/devolvido.";
    }
    await saveSettings({ provider: "resend", status: "connected", key_last4: apiKey.slice(-4), webhook_id: webhookId, last_error: lastError, connected_at: new Date().toISOString() });
    return json({ ok: true, webhook: !!webhookId, domains: (test.data?.data ?? []).map((d: any) => ({ id: d.id, name: d.name, status: d.status })) });
  }

  const apiKey = await loadKey();
  if (action === "disconnect") {
    const { data: s } = await admin.from("organization_email_settings").select("webhook_id").eq("organization_id", orgId).maybeSingle();
    if (s?.webhook_id && apiKey) await resendRequest(apiKey, "DELETE", `/webhooks/${s.webhook_id}`).catch(() => null);
    await admin.from("organization_email_secrets").delete().eq("organization_id", orgId);
    await saveSettings({ status: "disconnected", key_last4: null, webhook_id: null, last_error: null });
    return json({ ok: true });
  }
  if (!apiKey) return json({ error: "not_connected" }, 400);

  if (action === "domains") {
    const r = await resendRequest(apiKey, "GET", "/domains");
    if (!r.ok) return json({ error: "resend_error", status: r.status }, 502);
    return json({ ok: true, domains: (r.data?.data ?? []).map((d: any) => ({ id: d.id, name: d.name, status: d.status })) });
  }
  if (action === "add_domain") {
    const name = String(body.name ?? "").trim().toLowerCase();
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(name)) return json({ error: "invalid_domain" }, 400);
    const r = await resendRequest(apiKey, "POST", "/domains", { name });
    if (!r.ok) return json({ error: "resend_error", message: String(r.data?.message ?? "").slice(0, 200) }, 400);
    return json({ ok: true, domain: { id: r.data.id, name: r.data.name, status: r.data.status, records: r.data.records ?? [] } });
  }
  if (action === "domain" || action === "verify_domain") {
    const id = String(body.domain_id ?? "");
    if (!/^[A-Za-z0-9-]{8,}$/.test(id)) return json({ error: "invalid_params" }, 400);
    if (action === "verify_domain") await resendRequest(apiKey, "POST", `/domains/${id}/verify`);
    const r = await resendRequest(apiKey, "GET", `/domains/${id}`);
    if (!r.ok) return json({ error: "resend_error", status: r.status }, 502);
    const { data: s } = await admin.from("organization_email_settings").select("domain_id").eq("organization_id", orgId).maybeSingle();
    if (s?.domain_id === id) await saveSettings({ domain_status: r.data.status });
    return json({ ok: true, domain: { id: r.data.id, name: r.data.name, status: r.data.status, records: r.data.records ?? [] } });
  }
  if (action === "set_sender") {
    const id = String(body.domain_id ?? "");
    const local = String(body.from_local ?? "").trim().toLowerCase();
    const fromName = String(body.from_name ?? "").trim().slice(0, 80);
    const replyTo = String(body.reply_to ?? "").trim();
    if (!/^[a-z0-9._+-]{1,64}$/.test(local) || !fromName) return json({ error: "invalid_sender" }, 400);
    if (replyTo && !looksLikeEmail(replyTo)) return json({ error: "invalid_reply_to" }, 400);
    const r = await resendRequest(apiKey, "GET", `/domains/${id}`);
    if (!r.ok) return json({ error: "resend_error", status: r.status }, 502);
    if (r.data.status !== "verified") return json({ error: "domain_not_verified", status: r.data.status }, 400);
    await saveSettings({ domain_id: id, domain_name: r.data.name, domain_status: r.data.status, from_email: `${local}@${r.data.name}`, from_name: fromName, reply_to: replyTo || null });
    return json({ ok: true, from_email: `${local}@${r.data.name}` });
  }
  if (action === "send_test") {
    const to = String(body.to ?? "").trim();
    if (!looksLikeEmail(to)) return json({ error: "invalid_to" }, 400);
    const { data: s } = await admin.from("organization_email_settings").select("*").eq("organization_id", orgId).maybeSingle();
    const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
    if (!s?.from_email) return json({ error: "sender_not_set" }, 400);
    const { html, text } = renderEmail({
      body: "Este é um e-mail de teste do Seialz.\n\nSe chegou na caixa de entrada, o e-mail da organização está pronto para as réguas.",
      branding: { ...s, org_name: org?.name }, unsubscribeUrl: null,
    });
    const r = await resendRequest(apiKey, "POST", "/emails", {
      from: `${s.from_name ?? org?.name ?? ""} <${s.from_email}>`, to: [to], subject: "Teste de e-mail — Seialz",
      html, text, ...(s.reply_to ? { reply_to: s.reply_to } : {}),
    });
    if (!r.ok) return json({ error: "send_failed", message: String(r.data?.message ?? "").slice(0, 200) }, 400);
    return json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
});
