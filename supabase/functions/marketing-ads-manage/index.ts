// marketing-ads-manage — lista campanhas da conta de anúncios do negócio e permite
// pausar/ativar pelo Seialz. Escopos: ads_read (listar) + ads_management (mudar status).
// Escrita real. Auth: x-sync-token OU JWT + membership.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppSecret, resolveConnectionToken } from "../_shared/meta/connection.ts";
import { metaGraphGet, metaGraphPost, MetaGraphError } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const errMsg = (e: unknown): string =>
  e instanceof MetaGraphError ? (e.error?.message || `Meta error ${e.status}`) : (e as Error)?.message || "erro";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const action = String(body.action ?? "list");
    if (!organization_id) return json({ error: "missing_organization_id" }, 400);

    const svcToken = req.headers.get("x-sync-token");
    const serviceMode = Boolean(svcToken && svcToken === Deno.env.get("META_SYNC_TRIGGER_TOKEN"));
    if (!serviceMode) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error || !claims?.claims) return json({ error: "Unauthorized" }, 401);
      const { data: user } = await admin.from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
      if (!user) return json({ error: "user_not_found" }, 403);
      const { data: m } = await admin.from("user_organizations").select("id")
        .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
      if (!m) return json({ error: "forbidden_org" }, 403);
    }

    const { data: c } = await admin.from("meta_connections").select("id")
      .eq("organization_id", organization_id).eq("status", "connected")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!c) return json({ error: "no_connected_connection" }, 404);
    const connection_id = c.id;
    const { data: assets } = await admin.from("meta_assets")
      .select("external_id, asset_type").eq("connection_id", connection_id).eq("selection_state", "selected")
      .in("asset_type", ["ad_account"]);
    const adAccount = assets?.find((a: any) => a.asset_type === "ad_account")?.external_id as string | undefined;
    if (!adAccount) return json({ error: "no_ad_account" }, 404);

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();

    if (action === "list") {
      try {
        const r = await metaGraphGet(`/${adAccount}/campaigns`,
          { fields: "name,status,effective_status,objective", limit: 30 },
          { accessToken, appSecret });
        const campaigns = (r?.data ?? []).map((c: any) => ({
          id: c.id, name: c.name, status: c.status, effective_status: c.effective_status, objective: c.objective,
        }));
        return json({ ok: true, campaigns });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    if (action === "set_status") {
      const campaign_id = String(body.campaign_id ?? "");
      const status = String(body.status ?? "");
      if (!campaign_id || !["PAUSED", "ACTIVE"].includes(status)) return json({ error: "invalid_input" }, 400);
      try {
        await metaGraphPost(`/${campaign_id}`, { status }, { accessToken, appSecret });
        return json({ ok: true, id: campaign_id, status });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "internal_error" }, 500);
  }
});
