// Read-only diagnostic for a Meta WhatsApp Cloud phone number.
// Auth: caller must present the SUPABASE_SERVICE_ROLE_KEY as Bearer.
// Returns: subscribed_apps + rich phone_number_id GET + local echo.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaWaGet, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { resolveAppSecretForIntegration } from "../_shared/meta-whatsapp/credentials.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = req.headers.get("Authorization") ?? "";
  const diagToken = Deno.env.get("META_DIAG_TOKEN") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!diagToken || auth !== `Bearer ${diagToken}`) return json(401, { error: "unauthorized" });


  const { organizationId } = await req.json().catch(() => ({}));
  if (!organizationId) return json(400, { error: "missing_organization" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const { data: integ } = await admin
    .from("admin_integrations").select("id").eq("slug", "meta-whatsapp-cloud").maybeSingle();
  if (!integ?.id) return json(500, { error: "integration_not_seeded" });

  const { data: oi } = await admin
    .from("organization_integrations")
    .select("id, connected_account, config_values")
    .eq("organization_id", organizationId)
    .eq("integration_id", integ.id)
    .maybeSingle();

  if (!oi?.id) return json(404, { error: "no_org_integration" });

  const ca = oi.connected_account as any;
  const cv = oi.config_values as any;

  if (!ca?.access_token_encrypted || !ca?.phone_number_id || !ca?.waba_id) {
    return json(200, {
      connected: false,
      reason: "missing_fields",
      has_token: !!ca?.access_token_encrypted,
      has_pnid: !!ca?.phone_number_id,
      has_waba: !!ca?.waba_id,
      config_values: cv,
    });
  }

  const accessToken = await decryptSecret(ca.access_token_encrypted);
  const appSecret = await resolveAppSecretForIntegration(ca);
  const opts = { accessToken, appSecret };

  const results: Record<string, unknown> = {
    input: {
      organization_id: organizationId,
      phone_number_id: ca.phone_number_id,
      waba_id: ca.waba_id,
      app_id: ca.app_id ?? cv?.app_id ?? null,
    },
  };

  // (a) subscribed_apps on the WABA
  try {
    results.subscribed_apps = await metaWaGet(
      `/${ca.waba_id}/subscribed_apps`,
      { fields: "whatsapp_business_api_data" },
      opts,
    );
  } catch (e) {
    results.subscribed_apps_error = e instanceof MetaWaGraphError
      ? { status: e.status, error: e.error }
      : { message: String(e) };
  }

  // (b)+(c) rich phone_number_id GET
  try {
    results.phone_number = await metaWaGet(
      `/${ca.phone_number_id}`,
      {
        fields: [
          "id",
          "display_phone_number",
          "verified_name",
          "quality_rating",
          "messaging_limit_tier",
          "platform_type",
          "account_mode",
          "code_verification_status",
          "name_status",
          "status",
          "throughput",
          "is_official_business_account",
          "is_pin_enabled",
          "last_onboarded_time",
          "eligibility_for_api_business_global_search_listing",
        ].join(","),
      },
      opts,
    );
  } catch (e) {
    results.phone_number_error = e instanceof MetaWaGraphError
      ? { status: e.status, error: e.error }
      : { message: String(e) };
  }

  // WABA basics (owner, timezone, name)
  try {
    results.waba = await metaWaGet(
      `/${ca.waba_id}`,
      { fields: "id,name,timezone_id,message_template_namespace,on_behalf_of_business_info,owner_business_info,account_review_status,business_verification_status" },
      opts,
    );
  } catch (e) {
    results.waba_error = e instanceof MetaWaGraphError
      ? { status: e.status, error: e.error }
      : { message: String(e) };
  }

  return json(200, { ok: true, ...results });
});
