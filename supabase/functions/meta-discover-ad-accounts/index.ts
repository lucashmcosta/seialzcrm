import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { appSecretProof } from "../_shared/meta-graph.ts";
import { normalizeAdAccountId, resolveOrgAdsAccess } from "../_shared/meta/ads-access.ts";

const API_VERSION = "v25.0";
const GRAPH_TIMEOUT_MS = 30000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(
  code: string,
  message: string,
  metaResponse?: unknown,
  status = 400,
) {
  return json(
    { success: false, error_code: code, error_message: message, meta_response: metaResponse },
    status,
  );
}

function redactToken(t: string) {
  if (!t) return "";
  return `${t.slice(0, 8)}***`;
}

async function graphGet(path: string, token: string, fields?: string, appSecret?: string) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}${path}`);
  if (fields) url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  if (appSecret) url.searchParams.set("appsecret_proof", await appSecretProof(appSecret, token));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function validateAuth(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Bearer token" };
  }
  const token = authHeader.replace("Bearer ", "").trim();

  // 1) service_role env match
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return { ok: true };
  }

  // 2) internal function auth token from Vault
  try {
    const { data: internal } = await admin.rpc("get_internal_function_auth_token");
    if (internal && token === internal) return { ok: true };
  } catch (_e) {
    // ignore
  }

  // 3) JWT (user) — verify via getClaims
  try {
    const { data, error } = await admin.auth.getClaims(token);
    if (!error && data?.claims?.sub) return { ok: true };
  } catch (_e) {
    // ignore
  }

  return { ok: false, error: "Invalid token" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = await validateAuth(req, admin);
  if (!auth.ok) {
    return json({ success: false, error_code: "unauthorized", error_message: auth.error }, 401);
  }

  let body: { organization_id?: string; auto_save_if_single?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_body", "Invalid JSON body", undefined, 400);
  }

  const orgId = body.organization_id;
  const autoSave = body.auto_save_if_single === true;
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) {
    return errorResponse("invalid_body", "organization_id (uuid) required", undefined, 400);
  }

  // Credencial: mesma regra única (canônico se flag ON ou sem legado; senão legado).
  const res = await resolveOrgAdsAccess(admin, orgId, { tag: "meta-discover-ad-accounts" });
  if (!res.ok) {
    if (res.reason === "no_credential") {
      return errorResponse(
        "no_meta_integration",
        "Org não tem integração Meta conectada",
        undefined,
        404,
      );
    }
    if (res.reason === "creds_error") {
      console.error("get_meta_credentials error:", res.message);
      return errorResponse("token_decrypt_failed", res.message, undefined, 500);
    }
    return errorResponse(
      "token_decrypt_failed",
      "Falha ao decriptar token da integração Meta. Reconecte a integração Meta para esta organização.",
      undefined,
      500,
    );
  }
  const access = res.access;
  const accessToken = access.token;
  // appsecret_proof só no canônico (app da plataforma); legado segue idêntico ao de hoje.
  const proofSecret = access.source === "canonical" ? access.appSecret : undefined;
  const cred = {
    meta_user_id: access.legacy?.meta_user_id ?? null,
    meta_user_name: access.legacy?.meta_user_name ?? null,
  };

  // Linha onde a escolha da ad account é persistida (slug `meta`) — igual nos dois modos.
  const sourceSlug = "meta";

  console.log(
    `[meta-discover-ad-accounts] org=${orgId} source=${access.source} slug=${sourceSlug} token=${redactToken(accessToken)}`,
  );

  // 1) permissions
  const perms = await graphGet("/me/permissions", accessToken, undefined, proofSecret);
  if (!perms.ok) {
    return errorResponse("meta_api_error", "Falha ao ler /me/permissions", perms.body, 502);
  }
  const tokenPermissions: string[] = (perms.body?.data ?? [])
    .filter((p: any) => p.status === "granted")
    .map((p: any) => p.permission);

  // 2) ad accounts
  const adAccountsRes = await graphGet(
    "/me/adaccounts",
    accessToken,
    "id,account_id,name,currency,timezone_name,account_status,business",
    proofSecret,
  );
  if (!adAccountsRes.ok) {
    return errorResponse(
      "meta_api_error",
      "Falha ao listar /me/adaccounts",
      adAccountsRes.body,
      502,
    );
  }
  let adAccounts: any[] = adAccountsRes.body?.data ?? [];
  // Canônico: só as ad accounts que o usuário SELECIONOU nos Ativos da Meta Connection.
  if (access.source === "canonical") {
    const selected = new Set(access.adAccountIds);
    adAccounts = adAccounts.filter((a: any) => selected.has(normalizeAdAccountId(a.id ?? a.account_id)));
  }

  // 3) businesses
  const bizRes = await graphGet("/me/businesses", accessToken, "id,name", proofSecret);
  const businesses: any[] = bizRes.ok ? (bizRes.body?.data ?? []) : [];

  if (adAccounts.length === 0) {
    return json({
      success: false,
      error_code: "no_ad_accounts",
      error_message: "Token não tem acesso a nenhum ad account",
      source_integration_slug: sourceSlug,
      credential_source: access.source,
      meta_user_id: cred.meta_user_id,
      meta_user_name: cred.meta_user_name,
      ad_accounts: [],
      businesses,
      token_permissions: tokenPermissions,
    });
  }

  // Auto-save
  let autoSaved = false;
  if (autoSave && adAccounts.length === 1) {
    const acc = adAccounts[0];
    const patch = {
      ad_account_id: acc.id, // act_xxx
      ad_account_name: acc.name,
      business_id: acc.business?.id ?? null,
    };

    const { data: integ } = await admin
      .from("admin_integrations")
      .select("id")
      .eq("slug", sourceSlug)
      .maybeSingle();

    if (integ?.id) {
      const { data: oi } = await admin
        .from("organization_integrations")
        .select("id, connected_account")
        .eq("organization_id", orgId)
        .eq("integration_id", integ.id)
        .maybeSingle();
      if (oi?.id) {
        const merged = { ...(oi.connected_account ?? {}), ...patch };
        const { error: upErr } = await admin
          .from("organization_integrations")
          .update({ connected_account: merged, updated_at: new Date().toISOString() })
          .eq("id", oi.id);
        if (!upErr) autoSaved = true;
        else console.error("auto-save failed:", upErr);
      }
    }
  }

  return json({
    success: true,
    source_integration_slug: sourceSlug,
    credential_source: access.source,
    meta_user_id: cred.meta_user_id,
    meta_user_name: cred.meta_user_name,
    ad_accounts: adAccounts,
    businesses,
    token_permissions: tokenPermissions,
    auto_saved: autoSaved,
  });
});
