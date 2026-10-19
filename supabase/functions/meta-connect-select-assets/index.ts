// meta-connect-select-assets — persiste a seleção explícita de ativos da org.
// Só ativos 'selected' entram em sync (multi-tenant seguro). verify_jwt=true.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";
import { audit, resolveConnectionToken, facebookAppSecret } from "../_shared/meta/connection.ts";

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
      .eq("user_id", user.id).eq("organization_id", organization_id).eq("is_active", true).maybeSingle();
    if (!membership) return json({ error: "forbidden_org" }, 403);

    // Check access with the candidate credential before activation. Existing routes remain pinned.
    const { data: candidate } = await admin.from('meta_connections').select('id')
      .eq('id', connection_id).eq('organization_id', organization_id).eq('status','connected').maybeSingle();
    if (!candidate) return json({ error: 'connection_not_found' }, 404);
    const tokenValue = await resolveConnectionToken(admin, connection_id);
    const { data: selectedAssets } = await admin.from('meta_assets').select('id,external_id')
      .eq('connection_id',connection_id).eq('organization_id',organization_id);
    for (const selection of selections.filter((s: any) => s.selection_state === 'selected')) {
      const asset = selectedAssets?.find((a: any) => a.id === selection.asset_id);
      if (!asset) return json({error:'invalid_assets'},400);
      try { await metaGraphGet(`/${asset.external_id}`, {fields:'id'}, {accessToken:tokenValue,appSecret:facebookAppSecret()}); }
      catch { return json({error:'asset_access_not_confirmed'},400); }
    }
    const { data: updated, error: selectionError } = await admin.rpc('rpc_select_meta_assets', {
      p_org: organization_id, p_connection: connection_id, p_selections: selections,
    });
    if (selectionError) return json({ error: 'asset_selection_failed' }, 400);

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
