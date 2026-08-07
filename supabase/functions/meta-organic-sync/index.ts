// meta-organic-sync — leitura orgânica (read-only) de Pages + Instagram Professional
// selecionados: media (posts/reels) + insights disponíveis → meta_media/meta_media_insights.
// Defensivo (métricas variam por tipo/plataforma). verify_jwt=true. Fases futuras: publish/comments/DM.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  classifyMetaError,
  facebookAppSecret,
  GRAPH_API_VERSION,
  graphPaginate,
  PARSER_VERSION,
  resolveConnectionToken,
  SYNC_VERSION,
} from "../_shared/meta/connection.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const toInt = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Math.round(Number(v));

// Extrai um valor de um array de insights do Graph (name -> values[0].value).
function pickMetric(rows: any[], names: string[]): number | null {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (names.includes(r?.name)) {
      const v = r?.values?.[0]?.value ?? r?.total_value?.value;
      if (v !== undefined) return toInt(typeof v === "object" ? Object.values(v).reduce((a: any, b: any) => a + Number(b), 0) : v);
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
    if (!organization_id || !connection_id) return json({ error: "missing_fields" }, 400);

    // Modo serviço (trigger headless/cron) via token dedicado; senão, JWT do usuário + membership.
    const svcToken = req.headers.get("x-sync-token");
    const serviceMode = Boolean(svcToken && svcToken === Deno.env.get("META_SYNC_TRIGGER_TOKEN"));
    if (!serviceMode) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
      if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
      const { data: user } = await admin.from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
      if (!user) return json({ error: "user_not_found" }, 403);
      const { data: membership } = await admin.from("user_organizations").select("id")
        .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
      if (!membership) return json({ error: "forbidden_org" }, 403);
    }
    const { data: conn } = await admin.from("meta_connections").select("id")
      .eq("id", connection_id).eq("organization_id", organization_id).maybeSingle();
    if (!conn) return json({ error: "connection_not_found" }, 404);

    const { data: assets } = await admin.from("meta_assets")
      .select("id, external_id, asset_type, metadata")
      .eq("connection_id", connection_id).eq("selection_state", "selected")
      .in("asset_type", ["page", "instagram_account"]);
    if (!assets?.length) return json({ success: true, message: "no_selected_organic_assets" });

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    const MAX_MEDIA = 100;
    const results: any[] = [];

    for (const asset of assets) {
      const { data: run } = await admin.from("meta_sync_runs").insert({
        organization_id, connection_id, asset_id: asset.id, kind: "organic", mode: "incremental",
        sync_version: SYNC_VERSION, parser_version: PARSER_VERSION, source_api_version: GRAPH_API_VERSION, status: "running",
      }).select("id").single();
      await admin.from("meta_sync_state").upsert({
        organization_id, connection_id, asset_id: asset.id, kind: "organic", sync_status: "running",
      }, { onConflict: "asset_id,kind" });

      const stats = { media: 0, insights: 0 };
      try {
        const platform = asset.asset_type === "instagram_account" ? "instagram" : "facebook";
        // Página exige PAGE access token (erro #210 com token de usuário/system-user).
        let mediaToken = accessToken;
        if (platform === "facebook") {
          try {
            const pt = await metaGraphGet(`/${asset.external_id}`, { fields: "access_token" }, { accessToken, appSecret });
            if (pt?.access_token) mediaToken = pt.access_token;
          } catch (_) { /* sem page token -> tenta com o token atual */ }
        }
        let media: any[] = [];
        if (platform === "instagram") {
          media = await graphPaginate(`/${asset.external_id}/media`,
            { fields: "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url", limit: 50 },
            mediaToken, appSecret, { maxPages: 2 });
        } else {
          media = await graphPaginate(`/${asset.external_id}/published_posts`,
            { fields: "id,message,permalink_url,created_time,full_picture", limit: 50 },
            mediaToken, appSecret, { maxPages: 2 });
        }

        for (const m of media.slice(0, MAX_MEDIA)) {
          const mediaType = platform === "instagram"
            ? (m.media_product_type === "REELS" ? "reel" : String(m.media_type ?? "post").toLowerCase())
            : "post";
          const { data: mediaRow } = await admin.from("meta_media").upsert({
            organization_id, connection_id, asset_id: asset.id, platform, media_type: mediaType,
            external_id: String(m.id), permalink: m.permalink ?? m.permalink_url ?? null,
            caption: m.caption ?? m.message ?? null, thumbnail_url: m.thumbnail_url ?? m.full_picture ?? null,
            published_at: m.timestamp ?? m.created_time ?? null,
            raw: m, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
          }, { onConflict: "connection_id,external_id" }).select("id").single();
          stats.media++;
          if (!mediaRow) continue;

          // Insights por mídia (métricas variam; tolera erro).
          try {
            // Métricas por tipo de mídia (IG varia: reels têm views/shares/saved). Erros tolerados.
            const metric = platform === "instagram"
              ? (mediaType === "reel"
                ? "views,reach,likes,comments,shares,saved"
                : "reach,likes,comments,saved,shares")
              : "post_impressions,post_clicks";
            const ins = await metaGraphGet(`/${m.id}/insights`, { metric }, { accessToken: mediaToken, appSecret });
            const rows = ins?.data ?? [];
            await admin.from("meta_media_insights").upsert({
              // end_time sentinela p/ lifetime: NULL quebra o UNIQUE (NULL≠NULL) → duplicaria.
              organization_id, connection_id, media_id: mediaRow.id, period: "lifetime", end_time: "1970-01-01",
              reach: pickMetric(rows, ["reach", "post_impressions_unique"]),
              impressions: pickMetric(rows, ["impressions", "post_impressions"]),
              views: pickMetric(rows, ["views", "plays", "ig_reels_video_view_total_time"]),
              engagement: pickMetric(rows, ["engagement", "post_engaged_users"]),
              likes: pickMetric(rows, ["likes"]),
              comments: pickMetric(rows, ["comments"]),
              shares: pickMetric(rows, ["shares"]),
              saves: pickMetric(rows, ["saved"]),
              raw: rows, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
            }, { onConflict: "media_id,period,end_time" });
            stats.insights++;
          } catch (_) { /* métrica indisponível p/ esse tipo/mídia */ }
        }

        await admin.from("meta_sync_state").upsert({
          organization_id, connection_id, asset_id: asset.id, kind: "organic",
          sync_status: "idle", last_synced_at: new Date().toISOString(), counters: stats,
          error_class: null, error_message: null,
        }, { onConflict: "asset_id,kind" });
        await admin.from("meta_sync_runs").update({ status: "success", completed_at: new Date().toISOString(), stats }).eq("id", run?.id);
        results.push({ asset_id: asset.id, ...stats });
      } catch (err) {
        const cls = classifyMetaError(err);
        await admin.from("meta_sync_state").upsert({
          organization_id, connection_id, asset_id: asset.id, kind: "organic",
          sync_status: "error", error_class: cls, error_message: (err as Error).message?.slice(0, 300),
        }, { onConflict: "asset_id,kind" });
        await admin.from("meta_sync_runs").update({
          status: "error", completed_at: new Date().toISOString(), error_class: cls,
          error_message: (err as Error).message?.slice(0, 300), stats,
        }).eq("id", run?.id);
        results.push({ asset_id: asset.id, error: cls });
      }
    }

    return json({ success: true, results });
  } catch (e) {
    console.error("meta-organic-sync error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
