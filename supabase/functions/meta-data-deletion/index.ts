// meta-data-deletion — fluxo SEPARADO do disconnect (obrigação Meta + retenção).
// Iniciado pelo usuário. Registra a solicitação + evidência e revoga a credencial.
// (Purga analítica completa fica para job de retenção — evitando exclusão irreversível na V1.)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { audit } from "../_shared/meta/connection.ts";

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
    const connection_id = body.connection_id ? String(body.connection_id) : null;
    if (!organization_id) return json({ error: "missing_organization_id" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: user } = await admin.from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
    if (!user) return json({ error: "user_not_found" }, 403);
    const { data: membership } = await admin.from("user_organizations").select("id")
      .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!membership) return json({ error: "forbidden_org" }, 403);

    const { data: reqRow } = await admin.from("meta_data_deletion_requests").insert({
      organization_id, connection_id, origin: "user", status: "processing",
      evidence: { requested_by: user.id },
    }).select("id").single();

    // Revoga credencial (reversível via reconexão). Purga analítica -> retenção (documentado).
    let credentialsRemoved = 0;
    if (connection_id) {
      const { data } = await admin.from("meta_connection_credentials").delete()
        .eq("connection_id", connection_id).select("id");
      credentialsRemoved = data?.length ?? 0;
      await admin.from("meta_connections").update({ status: "revoked", last_health: "data_deletion" })
        .eq("id", connection_id).eq("organization_id", organization_id);
      await admin.from("meta_sync_state").update({ sync_status: "idle" }).eq("connection_id", connection_id);
    }

    await admin.from("meta_data_deletion_requests").update({
      status: "completed", completed_at: new Date().toISOString(),
      evidence: { requested_by: user.id, credentials_removed: credentialsRemoved, analytic_purge: "scheduled_retention" },
    }).eq("id", reqRow?.id);

    await audit(admin, {
      organization_id, connection_id, actor_user_id: user.id,
      action: "data_deletion", detail: { request_id: reqRow?.id, credentials_removed: credentialsRemoved },
    });

    return json({ success: true, request_id: reqRow?.id, credentials_removed: credentialsRemoved });
  } catch (e) {
    console.error("meta-data-deletion error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
