import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { metaGraphGet, MetaGraphError } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      organization_id,
      pixel_id,
      access_token,
      test_event_code,
      whatsapp_business_account_id,
      page_id,
      default_event_source_url,
    } = body || {};

    if (!organization_id || !pixel_id) {
      return json({ error: "organization_id e pixel_id são obrigatórios" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integ } = await admin
      .from("admin_integrations")
      .select("id")
      .eq("slug", "meta-capi")
      .maybeSingle();
    if (!integ) return json({ error: "meta-capi não registrada em admin_integrations" }, 500);

    const { data: existing } = await admin
      .from("organization_integrations")
      .select("id, connected_account")
      .eq("organization_id", organization_id)
      .eq("integration_id", integ.id)
      .maybeSingle();

    const ca = (existing?.connected_account || {}) as any;

    let access_token_encrypted: string | null = ca.access_token_encrypted || null;
    let access_token_last4: string | null = ca.access_token_last4 || null;
    let tokenForValidation: string | null = null;

    if (access_token && String(access_token).trim().length > 0) {
      const t = String(access_token).trim();
      tokenForValidation = t;
      access_token_encrypted = await encryptSecret(t);
      access_token_last4 = t.slice(-4);
    } else if (access_token_encrypted) {
      if (!existing) {
        return json({ error: "access_token é obrigatório na primeira conexão" }, 400);
      }
    } else {
      return json({ error: "access_token é obrigatório" }, 400);
    }

    if (tokenForValidation) {
      try {
        const res = await metaGraphGet(`/${pixel_id}`, { fields: "id,name" }, {
          accessToken: tokenForValidation,
        });
        if (!res?.id) {
          return json({ error: "Pixel ID não encontrado", meta_error_code: 100 }, 400);
        }
      } catch (e) {
        if (e instanceof MetaGraphError) {
          return json({
            error: e.error.message || "Meta rejeitou a validação",
            meta_error_code: e.error.code,
          }, 400);
        }
        throw e;
      }
    }

    const { data: user } = await admin
      .from("users")
      .select("id")
      .eq("auth_user_id", claims.claims.sub)
      .maybeSingle();

    const connected_account = {
      ...ca,
      pixel_id: String(pixel_id).trim(),
      access_token_encrypted,
      access_token_last4,
      test_event_code: test_event_code || null,
      whatsapp_business_account_id: whatsapp_business_account_id || null,
      page_id: page_id || null,
      default_event_source_url: default_event_source_url || null,
      token_source: "manual",
      status: "connected",
      last_token_check_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await admin
        .from("organization_integrations")
        .update({
          is_enabled: true,
          connected_account,
          connected_at: new Date().toISOString(),
          connected_by_user_id: user?.id,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("organization_integrations")
        .insert({
          organization_id,
          integration_id: integ.id,
          is_enabled: true,
          connected_account,
          connected_at: new Date().toISOString(),
          connected_by_user_id: user?.id,
        });
      if (error) throw error;
    }

    return json({ success: true });
  } catch (e: any) {
    console.error("meta-capi-connect error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
