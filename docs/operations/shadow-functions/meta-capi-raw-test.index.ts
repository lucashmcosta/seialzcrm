// ARQUIVO MORTO — recuperado do deploy ad-hoc v14 (2026-05-05) em 2026-07-05.
// Fora do caminho de deploy. Ver README.md neste diretorio.
// ⚠️ AUTH FRACA: só checa a presenca de "Bearer " no header — nao valida
// service_role. Nao redeployar sem corrigir (usar validateServiceRoleAuth).
// ----------------------------------------------------------------------------
// meta-capi-raw-test: envia payload arbitrario direto pro Meta CAPI
// Usado pra debug/teste rapido - bypassa toda strategy/validation
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: service_role only
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing auth" }, 401);
  }

  try {
    const body = await req.json();
    const { organization_id, raw_payload } = body;

    if (!organization_id || !raw_payload) {
      return json({ error: "organization_id and raw_payload required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration } = await admin
      .from("organization_integrations")
      .select("connected_account, admin_integrations!inner(slug)")
      .eq("organization_id", organization_id)
      .eq("admin_integrations.slug", "meta-capi")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!integration?.connected_account) {
      return json({ error: "meta-capi not connected for this org" }, 404);
    }

    const ca = integration.connected_account as any;
    const accessToken = await decryptSecret(ca.access_token_encrypted);
    const pixelId = ca.pixel_id;

    const url = `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

    console.log("[RAW TEST] Sending payload to Meta:", JSON.stringify(raw_payload));

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raw_payload),
    });
    const result = await resp.json().catch(() => ({}));

    console.log("[RAW TEST] Meta response:", JSON.stringify(result));

    return json({
      http_status: resp.status,
      meta_response: result,
      pixel_id_used: pixelId,
      payload_sent: raw_payload,
    });
  } catch (e: any) {
    console.error("meta-capi-raw-test error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
