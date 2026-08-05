import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptIntegrationSecret } from "../_shared/integration-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    console.warn("[nammux-credential-manage] missing authorization header");
    return json(401, { error: "missing_authorization" });
  }

  // Valida o token com o client service-role (mesmo padrão de _shared/auth.ts).
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) {
    console.warn("[nammux-credential-manage] authorization rejected", {
      code: authError?.code ?? null,
      status: authError?.status ?? null,
      message: authError?.message ?? null,
    });
    return json(401, { error: "invalid_authorization" });
  }

  const body = await req.json().catch(() => ({}));
  const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
  const action = typeof body.action === "string" ? body.action : "status";
  if (!organizationId) return json(400, { error: "organization_id_required" });
  const { data: internalUser } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (!internalUser) return json(403, { error: "internal_user_not_found" });

  const { data: membership } = await admin
    .from("user_organizations")
    .select("permission_profile_id")
    .eq("user_id", internalUser.id)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership) return json(403, { error: "organization_membership_required" });

  const { data: profile } = await admin
    .from("permission_profiles")
    .select("permissions")
    .eq("id", membership.permission_profile_id)
    .maybeSingle();
  const permissions = (profile?.permissions ?? {}) as Record<string, unknown>;
  if (permissions.can_manage_integrations !== true) {
    return json(403, { error: "can_manage_integrations_required" });
  }

  if (action === "status") {
    const { data, error } = await admin
      .from("nammux_integration_credentials")
      .select("key_id, is_active, valid_from, expires_at, created_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return json(500, { error: "credential_status_failed" });
    return json(200, { ok: true, credentials: data ?? [] });
  }

  if (action === "rotate") {
    const secret = typeof body.secret === "string" ? body.secret.trim() : "";
    const keyId =
      typeof body.key_id === "string" && body.key_id.trim()
        ? body.key_id.trim()
        : `nammux_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    if (secret.length < 32) return json(400, { error: "secret_too_short" });

    let ciphertext: string;
    try {
      ciphertext = await encryptIntegrationSecret(secret);
    } catch (error) {
      return json(500, {
        error: "credential_encryption_failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }

    const overlapUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: previous } = await admin
      .from("nammux_integration_credentials")
      .select("key_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await admin
      .from("nammux_integration_credentials")
      .update({ expires_at: overlapUntil })
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("expires_at", null);

    const { error } = await admin.from("nammux_integration_credentials").insert({
      organization_id: organizationId,
      key_id: keyId,
      secret_ciphertext: ciphertext,
      rotated_from_key_id: previous?.key_id ?? null,
      created_by_user_id: internalUser.id,
    });
    if (error) return json(400, { error: "credential_save_failed", details: error.message });

    await admin.rpc("fn_sync_nammux_subscription", { p_org_id: organizationId });
    return json(200, { ok: true, key_id: keyId, previous_valid_until: overlapUntil });
  }

  if (action === "revoke") {
    const keyId = typeof body.key_id === "string" ? body.key_id.trim() : "";
    if (!keyId) return json(400, { error: "key_id_required" });
    const { error } = await admin
      .from("nammux_integration_credentials")
      .update({ is_active: false, expires_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("key_id", keyId);
    if (error) return json(500, { error: "credential_revoke_failed" });
    await admin.rpc("fn_sync_nammux_subscription", { p_org_id: organizationId });
    return json(200, { ok: true });
  }

  return json(400, { error: "unsupported_action" });
});
