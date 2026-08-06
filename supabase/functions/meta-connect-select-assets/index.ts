// meta-connect-select-assets — persiste a seleção explícita de ativos da org.
// Só ativos 'selected' entram em sync (multi-tenant seguro). verify_jwt=true.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { audit } from "../_shared/meta/connection.ts";

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
    const connection_id = String(body.connection_id ?? "");
    // selections: [{ asset_id, selection_state }]
    const selections = Array.isArray(body.selections) ? body.selections : [];
    if (!organization_id || !connection_id || selections.length === 0) {
      return json({ error: "missing_fields" }, 400);
    }
    const valid = new Set(["selected", "disabled", "discovered"]);
    for (const s of selections) {
      if (!s?.asset_id || !valid.has(s?.selection_state)) return json({ error: "invalid_selection" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: user } = await admin
      .from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
    if (!user) return json({ error: "user_not_found" }, 403);
    const { data: membership } = await admin
      .from("user_organizations").select("id")
      .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!membership) return json({ error: "forbidden_org" }, 403);

    let updated = 0;
    for (const s of selections) {
      const { data, error } = await admin.from("meta_assets")
        .update({ selection_state: s.selection_state })
        .eq("id", s.asset_id)
        .eq("organization_id", organization_id)
        .eq("connection_id", connection_id)
        .select("id");
      if (!error && data?.length) updated += data.length;
    }

    await audit(admin, {
      organization_id, connection_id, actor_user_id: user.id,
      action: "select_assets",
      detail: { count: updated },
    });

    return json({ success: true, updated });
  } catch (e) {
    console.error("meta-connect-select-assets error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
