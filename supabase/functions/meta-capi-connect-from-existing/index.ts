import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
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

    // Fetch Meta Lead Ads token
    const { data: leadAds } = await admin
      .from("organization_integrations")
      .select("connected_account, admin_integrations!inner(slug)")
      .eq("organization_id", organization_id)
      .eq("admin_integrations.slug", "meta-lead-ads")
      .eq("is_enabled", true)
      .maybeSingle();

    const enc = (leadAds?.connected_account as any)?.system_user_token_encrypted;
    if (!enc) {
      return json({ error: "Meta Lead Ads não conectado nesta org. Não é possível reusar o token." }, 400);
    }

    let tokenPlain: string;
    try {
      tokenPlain = await decryptSecret(enc);
    } catch (e: any) {
      return json({ error: "Falha ao descriptografar token do Meta Lead Ads: " + e.message }, 500);
    }

    // Validate pixel access
    try {
      const res = await metaGraphGet(`/${pixel_id}`, { fields: "id,name" }, {
        accessToken: tokenPlain,
      });
      if (!res?.id) {
        return json({ error: "Pixel ID não encontrado pelo token do Meta Lead Ads", meta_error_code: 100 }, 400);
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

    const { data: integ } = await admin
      .from("admin_integrations")
      .select("id")
      .eq("slug", "meta-capi")
      .maybeSingle();
    if (!integ) return json({ error: "meta-capi não registrada" }, 500);

    const { data: existing } = await admin
      .from("organization_integrations")
      .select("id, connected_account")
      .eq("organization_id", organization_id)
      .eq("integration_id", integ.id)
      .maybeSingle();

    const ca = (existing?.connected_account || {}) as any;

    const { data: user } = await admin
      .from("users")
      .select("id")
      .eq("auth_user_id", claims.claims.sub)
      .maybeSingle();

    // Re-encrypt the token into meta-capi's OWN access_token_encrypted slot.
    // CAPI is now autonomous at runtime — no cross-slug reads.
    let ownAccessTokenEncrypted: string;
    try {
      ownAccessTokenEncrypted = await encryptSecret(tokenPlain);
    } catch (e: any) {
      return json({ error: "Falha ao cifrar token para meta-capi: " + e.message }, 500);
    }

    const connected_account = {
      ...ca,
      pixel_id: String(pixel_id).trim(),
      access_token_encrypted: ownAccessTokenEncrypted,
      access_token_last4: tokenPlain.slice(-4),
      test_event_code: test_event_code || null,
      whatsapp_business_account_id: whatsapp_business_account_id || null,
      page_id: page_id || null,
      default_event_source_url: default_event_source_url || null,
      // token_source intentionally omitted — CAPI uses its own token now.
      status: "connected",
      last_token_check_at: new Date().toISOString(),
    };
    // Strip any legacy token_source marker.
    delete (connected_account as any).token_source;

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

    return json({ success: true, token_source: "self" });
  } catch (e: any) {
    console.error("meta-capi-connect-from-existing error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
