// Verifica o estado atual da integração Meta WhatsApp Cloud:
// - reconfere phone_number_id na Graph API
// - atualiza metadata com a última validação
// Fase 3: removida a noção de "configuração global" (platform status).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { validateCredentials, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { resolveAppSecretForIntegration } from "../_shared/meta-whatsapp/credentials.ts";

function err(status: number, message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "method_not_allowed");
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return err(401, "unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await supabaseUser.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return err(401, "unauthorized");
    const authUid = claims.claims.sub as string;

    const { organizationId } = await req.json().catch(() => ({}));
    if (!organizationId) return err(400, "missing_organization");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userRow } = await admin
      .from("users").select("id").eq("auth_user_id", authUid).maybeSingle();
    if (!userRow?.id) return err(403, "user_not_found");
    const { data: membership } = await admin
      .from("user_organizations").select("organization_id")
      .eq("user_id", userRow.id).eq("organization_id", organizationId).maybeSingle();
    if (!membership) return err(403, "not_a_member");

    const { data: integ } = await admin
      .from("admin_integrations").select("id").eq("slug", "meta-whatsapp-cloud").maybeSingle();
    if (!integ?.id) return err(500, "integration_not_seeded");

    const { data: oi } = await admin
      .from("organization_integrations")
      .select("id, connected_account, config_values")
      .eq("organization_id", organizationId)
      .eq("integration_id", integ.id)
      .maybeSingle();

    if (!oi?.id) {
      return new Response(JSON.stringify({ connected: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ca = oi.connected_account as any;
    let metaResult: any = null;
    let validationError: any = null;
    try {
      const accessToken = ca?.access_token_encrypted
        ? await decryptSecret(ca.access_token_encrypted)
        : null;
      if (accessToken && ca?.phone_number_id && ca?.waba_id) {
        const appSecret = await resolveAppSecretForIntegration(ca);
        metaResult = await validateCredentials({
          phoneNumberId: ca.phone_number_id,
          wabaId: ca.waba_id,
          accessToken,
          appSecret,
        });
      }
    } catch (e) {
      validationError = e instanceof MetaWaGraphError
        ? { code: e.error.code, message: e.error.message }
        : { message: (e as Error).message };
    }

    if (metaResult) {
      await admin
        .from("organization_integrations")
        .update({
          config_values: {
            ...(oi.config_values as any),
            display_phone_number: metaResult.display_phone_number,
            verified_name: metaResult.verified_name,
            quality_rating: metaResult.quality_rating,
            messaging_limit_tier: metaResult.messaging_limit_tier,
            last_validated_at: new Date().toISOString(),
          },
        })
        .eq("id", oi.id);

      await admin
        .from("communication_endpoints")
        .update({
          quality_rating: metaResult.quality_rating ?? null,
          status: "online",
        })
        .eq("organization_id", organizationId)
        .eq("provider", "meta_cloud_api");
    }

    return new Response(JSON.stringify({
      connected: true,
      meta: metaResult,
      validation_error: validationError,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return err(500, "internal_error", { message: (e as Error).message });
  }
});
