import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import { resolveOrgMetaToken } from "../_shared/meta/connection.ts";
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
    if (!organization_id) {
      return json({ error: "Missing required fields" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Sem token manual: ativa Lead Generation pela regra única (resolveOrgMetaToken).
    // Legado = token já salvo no slug meta-lead-ads; canônico quando flag ON ou sem legado.
    if (!system_user_token) {
      return await connectWithoutManualToken(admin, authHeader, claims.claims.sub, organization_id);
    }

    // Validate token via Meta Graph
    let me;
    try {
      me = await metaGraphGet("/me", { fields: "id,name" }, {
        accessToken: system_user_token,
        appSecret: app_secret || undefined,
      });
    } catch (e: any) {
      return json({ error: "Invalid Meta credentials", details: e.message }, 400);
    }

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
    const enc_secret = app_secret ? await encryptSecret(app_secret) : null;

    const connected_account = {
      app_id: app_id || null,
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

    fireDiscover(authHeader, orgIntegrationId, organization_id);

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

function fireDiscover(authHeader: string, orgIntegrationId: string, organization_id: string) {
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
}

async function connectWithoutManualToken(
  admin: any,
  authHeader: string,
  authUserId: string,
  organization_id: string,
): Promise<Response> {
  // Este caminho usa a credencial JÁ guardada da org (não um token trazido pelo
  // chamador) → exige que o usuário seja membro da org (mesmo padrão do meta-connect-discover).
  const { data: user } = await admin
    .from("users").select("id").eq("auth_user_id", authUserId).maybeSingle();
  if (!user) return json({ error: "user_not_found" }, 403);
  const { data: membership } = await admin
    .from("user_organizations").select("id")
    .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
  if (!membership) return json({ error: "forbidden_org" }, 403);

  const { data: integ } = await admin
    .from("admin_integrations").select("id").eq("slug", "meta-lead-ads").maybeSingle();
  if (!integ) return json({ error: "meta-lead-ads not registered" }, 500);

  const { data: existing } = await admin
    .from("organization_integrations")
    .select("id, config_values, connected_account")
    .eq("organization_id", organization_id)
    .eq("integration_id", integ.id)
    .maybeSingle();
  const ca: any = existing?.connected_account || {};

  const resolved = await resolveOrgMetaToken(admin, organization_id, async () => {
    if (!ca.system_user_token_encrypted) return null;
    return {
      token: await decryptSecret(ca.system_user_token_encrypted),
      appSecret: ca.app_secret_encrypted ? await decryptSecret(ca.app_secret_encrypted) : undefined,
    };
  }, { capability: "lead-generation" });
  // Sem nenhuma credencial: mesmo erro de antes (token manual era obrigatório).
  if (!resolved) return json({ error: "Missing required fields" }, 400);

  let me: any;
  try {
    me = await metaGraphGet("/me", { fields: "id,name" }, {
      accessToken: resolved.token,
      appSecret: resolved.appSecret,
    });
  } catch (e: any) {
    return json({ error: "Invalid Meta credentials", details: e.message }, 400);
  }

  // Canônico: NUNCA grava token na linha legada (senão a org "ganharia" um legado
  // congelado e a regra passaria a escolhê-lo). Legado: mantém os tokens já salvos.
  const connected_account = {
    ...ca,
    meta_user_id: me.id,
    meta_user_name: me.name,
    status: "connected",
    token_source: resolved.source,
    ...(resolved.source === "canonical" ? { connection_id: resolved.connection_id ?? null } : {}),
    last_token_check_at: new Date().toISOString(),
  };
  const config_values = {
    ...(existing?.config_values || {}),
    meta_lead_ads_settings: {
      ...DEFAULT_SETTINGS,
      ...((existing?.config_values as any)?.meta_lead_ads_settings || {}),
    },
  };

  let orgIntegrationId: string;
  if (existing) {
    const { error } = await admin.from("organization_integrations").update({
      is_enabled: true, connected_account, config_values,
      connected_at: new Date().toISOString(), connected_by_user_id: user?.id,
    }).eq("id", existing.id);
    if (error) throw error;
    orgIntegrationId = existing.id;
  } else {
    const { data: ins, error } = await admin.from("organization_integrations").insert({
      organization_id, integration_id: integ.id, is_enabled: true, connected_account, config_values,
      connected_at: new Date().toISOString(), connected_by_user_id: user?.id,
    }).select("id").single();
    if (error) throw error;
    orgIntegrationId = ins.id;
  }

  fireDiscover(authHeader, orgIntegrationId, organization_id);
  return json({
    success: true,
    organization_integration_id: orgIntegrationId,
    meta_user: { id: me.id, name: me.name },
    credential_source: resolved.source,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
