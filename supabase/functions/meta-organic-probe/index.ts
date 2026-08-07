// meta-organic-probe — sondagem READ-ONLY da Graph API (v26) para reconciliação por mídia.
// NÃO grava nada. Para cada external_id, captura, de forma sanitizada (só números):
//   - campos-objeto da mídia (like_count/comments_count — o que o app do IG exibe);
//   - métricas de insights (views/reach/likes/comments/shares/saved | post_media_view);
//   - opcional: account-level insights (IG/Page) para conferir a semântica do Overview.
// Auth: x-sync-token (serviço) OU JWT do usuário + membership. verify_jwt=true.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppSecret, resolveConnectionToken } from "../_shared/meta/connection.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const num = (v: unknown): number | null => v === null || v === undefined || v === "" ? null : Math.round(Number(v));
function pick(rows: any[], names: string[]): number | null {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (names.includes(r?.name)) {
      const v = r?.values?.[0]?.value ?? r?.total_value?.value;
      if (v !== undefined) return num(typeof v === "object" ? Object.values(v).reduce((a: any, b: any) => a + Number(b), 0) : v);
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const connection_id = String(body.connection_id ?? "");
    const externalIds: string[] = Array.isArray(body.external_ids) ? body.external_ids.map(String) : [];
    const withAccount = Boolean(body.account_insights);
    if (!organization_id || !connection_id) return json({ error: "missing_fields" }, 400);

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
    const { data: conn } = await admin.from("meta_connections").select("id")
      .eq("id", connection_id).eq("organization_id", organization_id).maybeSingle();
    if (!conn) return json({ error: "connection_not_found" }, 404);

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    const fetched_at = new Date().toISOString();

    // page tokens por asset (cache), p/ mídias de Página.
    const pageTokens = new Map<string, string>();
    const pageTokenFor = async (assetExternalId: string): Promise<string> => {
      if (pageTokens.has(assetExternalId)) return pageTokens.get(assetExternalId)!;
      let t = accessToken;
      try {
        const pt = await metaGraphGet(`/${assetExternalId}`, { fields: "access_token" }, { accessToken, appSecret });
        if (pt?.access_token) t = pt.access_token;
      } catch (_) { /* usa o token atual */ }
      pageTokens.set(assetExternalId, t);
      return t;
    };

    const media: any[] = [];
    for (const ext of externalIds) {
      const { data: mrow } = await admin.from("meta_media")
        .select("id, platform, media_type, asset_id, published_at, meta_assets(external_id)")
        .eq("connection_id", connection_id).eq("external_id", ext).maybeSingle();
      const platform = mrow?.platform ?? "instagram";
      const assetExt = (mrow as any)?.meta_assets?.external_id as string | undefined;
      const token = platform === "facebook" && assetExt ? await pageTokenFor(assetExt) : accessToken;
      const out: any = { external_id: ext, platform, media_type: mrow?.media_type ?? null, object: {}, insights: {}, errors: {} };
      try {
        if (platform === "instagram") {
          const obj = await metaGraphGet(`/${ext}`, { fields: "like_count,comments_count,media_type,media_product_type,permalink,timestamp" }, { accessToken: token, appSecret });
          out.object = { like_count: num(obj?.like_count), comments_count: num(obj?.comments_count), media_type: obj?.media_type ?? null, media_product_type: obj?.media_product_type ?? null };
        } else {
          const obj = await metaGraphGet(`/${ext}`, { fields: "permalink_url,created_time,shares" }, { accessToken: token, appSecret });
          out.object = { shares: num(obj?.shares?.count) };
        }
      } catch (e) { out.errors.object = (e as Error).message?.slice(0, 200); }
      try {
        const metric = platform === "instagram"
          ? (mrow?.media_type === "reel" ? "views,reach,likes,comments,shares,saved" : "reach,likes,comments,saved,shares")
          : "post_media_view";
        const ins = await metaGraphGet(`/${ext}/insights`, { metric }, { accessToken: token, appSecret });
        const rows = ins?.data ?? [];
        out.insights = {
          views: pick(rows, ["views", "plays", "post_media_view"]),
          reach: pick(rows, ["reach"]),
          likes: pick(rows, ["likes"]),
          comments: pick(rows, ["comments"]),
          shares: pick(rows, ["shares"]),
          saves: pick(rows, ["saved"]),
        };
      } catch (e) { out.errors.insights = (e as Error).message?.slice(0, 200); }
      media.push(out);
    }

    // Account-level insights (semântica correta p/ Overview): IG e Page.
    const account: any = {};
    if (withAccount) {
      const { data: assets } = await admin.from("meta_assets")
        .select("external_id, asset_type").eq("connection_id", connection_id).eq("selection_state", "selected")
        .in("asset_type", ["page", "instagram_account"]);
      for (const a of assets ?? []) {
        try {
          if (a.asset_type === "instagram_account") {
            // IG account: reach/views (com metric_type=total_value quando aplicável).
            const r = await metaGraphGet(`/${a.external_id}/insights`,
              { metric: "reach,views", period: "days_28", metric_type: "total_value" }, { accessToken, appSecret });
            account.instagram = (r?.data ?? []).map((d: any) => ({ name: d.name, period: d.period, total_value: d.total_value?.value ?? d.values?.[0]?.value ?? null }));
          } else {
            const token = await pageTokenFor(a.external_id);
            const r = await metaGraphGet(`/${a.external_id}/insights`,
              { metric: "page_views,page_post_engagements", period: "days_28" }, { accessToken: token, appSecret });
            account.facebook = (r?.data ?? []).map((d: any) => ({ name: d.name, period: d.period, value: d.values?.[d.values.length - 1]?.value ?? null }));
          }
        } catch (e) { account[a.asset_type === "instagram_account" ? "instagram_error" : "facebook_error"] = (e as Error).message?.slice(0, 200); }
      }
    }

    return json({ success: true, graph_version: Deno.env.get("META_GRAPH_API_VERSION") || "default", fetched_at, media, account });
  } catch (e) {
    console.error("meta-organic-probe error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
