import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

const DEFAULT_SETTINGS = {
  auto_create_contact: true,
  auto_create_opportunity: false,
  default_pipeline_stage_id: null as string | null,
  default_lifecycle_stage: "lead",
  default_owner_user_id: null as string | null,
  use_round_robin: true,
  set_name_confirmed: true,
  auto_send_whatsapp: false,
  process_unmapped_forms: false,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { organization_id, app_id, app_secret, system_user_token, business_id } = body;
    if (!organization_id || !app_id || !app_secret || !system_user_token) {
      return json({ error: "Missing required fields" }, 400);
    }

    // Validate token via Meta Graph
    let me;
    try {
      me = await metaGraphGet("/me", { fields: "id,name" }, {
        accessToken: system_user_token,
        appSecret: app_secret,
      });
    } catch (e: any) {
      return json({ error: "Invalid Meta credentials", details: e.message }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find admin_integration id for slug
    const { data: integ } = await admin
      .from("admin_integrations")
      .select("id")
      .eq("slug", "meta-lead-ads")
      .maybeSingle();
    if (!integ) return json({ error: "meta-lead-ads not registered" }, 500);

    // Find user
    const { data: user } = await admin
      .from("users")
      .select("id")
      .eq("auth_user_id", claims.claims.sub)
      .maybeSingle();

    const enc_token = await encryptSecret(system_user_token);
    const enc_secret = await encryptSecret(app_secret);

    const connected_account = {
      app_id,
      app_secret_encrypted: enc_secret,
      system_user_token_encrypted: enc_token,
      business_id: business_id || null,
      meta_user_id: me.id,
      meta_user_name: me.name,
      status: "connected",
      last_token_check_at: new Date().toISOString(),
    };

    const { data: existing } = await admin
      .from("organization_integrations")
      .select("id, config_values")
      .eq("organization_id", organization_id)
      .eq("integration_id", integ.id)
      .maybeSingle();

    let orgIntegrationId: string;
    if (existing) {
      const config_values = {
        ...(existing.config_values || {}),
        meta_lead_ads_settings: {
          ...DEFAULT_SETTINGS,
          ...((existing.config_values as any)?.meta_lead_ads_settings || {}),
        },
      };
      const { error: updErr } = await admin
        .from("organization_integrations")
        .update({
          is_enabled: true,
          connected_account,
          config_values,
          connected_at: new Date().toISOString(),
          connected_by_user_id: user?.id,
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
      orgIntegrationId = existing.id;
    } else {
      const { data: ins, error: insErr } = await admin
        .from("organization_integrations")
        .insert({
          organization_id,
          integration_id: integ.id,
          is_enabled: true,
          connected_account,
          config_values: { meta_lead_ads_settings: DEFAULT_SETTINGS },
          connected_at: new Date().toISOString(),
          connected_by_user_id: user?.id,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      orgIntegrationId = ins.id;
    }

    // Fire discover in background
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-lead-ads-discover`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        organization_integration_id: orgIntegrationId,
        organization_id,
      }),
    }).catch(() => {});

    return json({
      success: true,
      organization_integration_id: orgIntegrationId,
      meta_user: { id: me.id, name: me.name },
    });
  } catch (e: any) {
    console.error("meta-lead-ads-connect error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
