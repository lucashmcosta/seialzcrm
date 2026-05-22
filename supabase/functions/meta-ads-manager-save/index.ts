// Saves Ads Manager configuration into the consolidated `meta` integration:
// - ensures connected_account.ad_account_id has `act_` prefix
// - copies token from legacy meta-lead-ads (encrypting if it was stored in plain text)
// - sets config_values.feature_ads_manager_sync
//
// Input: { organization_id, ad_account_id, ad_account_name?, business_id?, enable_sync }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret } from "../_shared/crypto.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function validateAuth(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, error: "Missing Bearer token" };
  const token = authHeader.replace("Bearer ", "").trim();
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { ok: true };
  try {
    const { data: internal } = await admin.rpc("get_internal_function_auth_token");
    if (internal && token === internal) return { ok: true };
  } catch (_e) { /* ignore */ }
  try {
    const { data, error } = await admin.auth.getClaims(token);
    if (!error && data?.claims?.sub) return { ok: true };
  } catch (_e) { /* ignore */ }
  return { ok: false, error: "Invalid token" };
}

function looksEncrypted(s: string | null | undefined): boolean {
  return !!s && s.startsWith("v1:") && s.split(":").length === 3;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = await validateAuth(req, admin);
  if (!auth.ok) return json({ success: false, error: auth.error }, 401);

  let body: {
    organization_id?: string;
    ad_account_id?: string;
    ad_account_name?: string | null;
    business_id?: string | null;
    enable_sync?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_body" }, 400);
  }

  const orgId = body.organization_id;
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) {
    return json({ success: false, error: "organization_id (uuid) required" }, 400);
  }
  let adAccountId = (body.ad_account_id || "").trim();
  if (!adAccountId) return json({ success: false, error: "ad_account_id required" }, 400);
  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;
  const enableSync = body.enable_sync !== false;

  // Load Meta integration slugs
  const { data: integs, error: iErr } = await admin
    .from("admin_integrations")
    .select("id, slug")
    .in("slug", ["meta", "meta-lead-ads", "meta-capi"]);
  if (iErr || !integs) {
    return json({ success: false, error: `admin_integrations: ${iErr?.message}` }, 500);
  }
  const metaInteg = integs.find((i: any) => i.slug === "meta");
  const leadInteg = integs.find((i: any) => i.slug === "meta-lead-ads");
  if (!metaInteg) return json({ success: false, error: "meta integration row not found" }, 500);

  // Load org rows
  const { data: orgRows } = await admin
    .from("organization_integrations")
    .select("id, integration_id, connected_account, config_values, is_enabled")
    .eq("organization_id", orgId)
    .in("integration_id", integs.map((i: any) => i.id));

  let metaOi = orgRows?.find((o: any) => o.integration_id === metaInteg.id) as any;
  const leadOi = orgRows?.find((o: any) => leadInteg && o.integration_id === leadInteg.id) as any;

  // Compute token to use on consolidated row
  const metaCa = (metaOi?.connected_account || {}) as any;
  let tokenEncrypted: string | null = metaCa.system_user_token_encrypted || null;

  if (!tokenEncrypted && leadOi) {
    const leadCa = (leadOi.connected_account || {}) as any;
    const candidate =
      leadCa.system_user_token_encrypted ||
      leadCa.system_user_token ||
      leadCa.access_token_encrypted ||
      leadCa.access_token;
    if (candidate) {
      if (looksEncrypted(candidate)) {
        tokenEncrypted = candidate;
      } else {
        try {
          tokenEncrypted = await encryptSecret(candidate);
        } catch (e: any) {
          return json(
            { success: false, error: `encrypt failed: ${e.message}` },
            500,
          );
        }
      }
    }
  }

  if (!tokenEncrypted) {
    return json(
      {
        success: false,
        error:
          "Nenhum token Meta encontrado. Conecte primeiro a aba Conexão (System User Token).",
      },
      400,
    );
  }

  // Merge into meta consolidated row
  const newConnectedAccount = {
    ...metaCa,
    system_user_token_encrypted: tokenEncrypted,
    ad_account_id: adAccountId,
    ad_account_name: body.ad_account_name ?? metaCa.ad_account_name ?? null,
    business_id: body.business_id ?? metaCa.business_id ?? null,
    status: "connected",
    last_token_check_at: new Date().toISOString(),
    last_token_check_error: null,
  };
  const newConfigValues = {
    ...((metaOi?.config_values || {}) as any),
    feature_ads_manager_sync: enableSync,
  };

  if (metaOi) {
    const { error: upErr } = await admin
      .from("organization_integrations")
      .update({
        connected_account: newConnectedAccount,
        config_values: newConfigValues,
        is_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", metaOi.id);
    if (upErr) return json({ success: false, error: upErr.message }, 500);
  } else {
    const { error: insErr } = await admin
      .from("organization_integrations")
      .insert({
        organization_id: orgId,
        integration_id: metaInteg.id,
        is_enabled: true,
        connected_account: newConnectedAccount,
        config_values: newConfigValues,
      });
    if (insErr) return json({ success: false, error: insErr.message }, 500);
  }

  return json({
    success: true,
    ad_account_id: adAccountId,
    feature_ads_manager_sync: enableSync,
  });
});
