// meta-connect-disconnect — desativa/revoga a conexão e INTERROMPE o sync, mas
// PRESERVA o histórico analítico (meta_* insights ficam). NÃO é data deletion.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { audit, facebookAppSecret, resolveConnectionToken } from "../_shared/meta/connection.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const connection_id = String(body.connection_id ?? "");
    if (!organization_id || !connection_id) return json({ error: "missing_fields" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: user } = await admin.from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
    if (!user) return json({ error: "user_not_found" }, 403);
    const { data: membership } = await admin.from("user_organizations").select("id")
      .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!membership) return json({ error: "forbidden_org" }, 403);
    const { data: conn } = await admin.from("meta_connections").select("id, authorizing_meta_user_id")
      .eq("id", connection_id).eq("organization_id", organization_id).maybeSingle();
    if (!conn) return json({ error: "connection_not_found" }, 404);

    // Best-effort: revoga o acesso do app na Meta (invalida o token).
    let revoked = false;
    try {
      const accessToken = await resolveConnectionToken(admin, connection_id);
      // DELETE /{user-id}/permissions via método override.
      await metaGraphGet(`/${conn.authorizing_meta_user_id ?? "me"}/permissions`,
        { method: "delete" }, { accessToken, appSecret: facebookAppSecret() });
      revoked = true;
    } catch (_) { /* segue com soft-disconnect mesmo se a revogação falhar */ }

    // Interrompe sync + marca a conexão (PRESERVA meta_assets/insights).
    await admin.from("meta_connections")
      .update({ status: revoked ? "revoked" : "disconnected", last_health: "disconnected" })
      .eq("id", connection_id);
    await admin.from("meta_sync_state")
      .update({ sync_status: "idle" })
      .eq("connection_id", connection_id);

    await audit(admin, {
      organization_id, connection_id, actor_user_id: user.id,
      action: "disconnect", detail: { revoked },
    });

    return json({ success: true, revoked, history_preserved: true });
  } catch (e) {
    console.error("meta-connect-disconnect error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
