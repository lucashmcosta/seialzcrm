// Desconecta a integração Meta WhatsApp Cloud de uma organização.
// Marca endpoints meta-cloud como inativos e desativa organization_integrations.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", userRow.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!membership) return err(403, "not_a_member");

    const { data: integ } = await admin
      .from("admin_integrations").select("id").eq("slug", "meta-whatsapp-cloud").maybeSingle();
    if (!integ?.id) return err(500, "integration_not_seeded");

    await admin
      .from("organization_integrations")
      .update({ is_enabled: false })
      .eq("organization_id", organizationId)
      .eq("integration_id", integ.id);

    await admin
      .from("communication_endpoints")
      .update({ is_active: false, status: "offline" })
      .eq("organization_id", organizationId)
      .eq("provider", "meta_cloud_api");

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[meta-whatsapp-disconnect] fatal", e);
    return err(500, "internal_error", { message: (e as Error).message });
  }
});
