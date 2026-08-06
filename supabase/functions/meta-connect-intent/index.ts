// meta-connect-intent — cria um nonce/intent efêmero (one-time) antes do FB.login.
// Vincula a tentativa OAuth a organization_id + user_id. verify_jwt=true (default).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppId, facebookConfigured, GRAPH_API_VERSION } from "../_shared/meta/connection.ts";

function json(body: unknown, status = 200): Response {
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
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    if (!organization_id) return json({ error: "missing_organization_id" }, 400);
    if (!facebookConfigured()) return json({ error: "facebook_not_configured" }, 503);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve o usuário interno e valida que pertence à organização.
    const { data: user } = await admin
      .from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
    if (!user) return json({ error: "user_not_found" }, 403);

    const { data: membership } = await admin
      .from("user_organizations").select("id")
      .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!membership) return json({ error: "forbidden_org" }, 403);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: intent, error: insErr } = await admin
      .from("meta_connection_intents")
      .insert({ organization_id, user_id: user.id, expires_at: expiresAt })
      .select("id").single();
    if (insErr) throw insErr;

    // Backend é a fonte única de app_id/config_id/versão (sem VITE_ duplicado).
    return json({
      intent_id: intent.id,
      app_id: facebookAppId() ?? null,
      config_id: Deno.env.get("FACEBOOK_CONFIG_ID")?.trim() || null,
      graph_version: GRAPH_API_VERSION,
    });
  } catch (e) {
    console.error("meta-connect-intent error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
