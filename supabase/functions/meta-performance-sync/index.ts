// meta-performance-sync — sync normalizado de Ads (campaigns/ad_sets/ads/creatives/insights).
// Escreve SOMENTE nas tabelas meta_* novas (não toca marketing_campaigns). Só ad accounts
// 'selected'. Idempotente (upsert por connection+external_id), paginação, backoff,
// cursor/checkpoint (meta_sync_state) e versionamento (meta_sync_runs). verify_jwt=true.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const toCents = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Math.round(Number(v) * 100);
const toInt = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Math.round(Number(v));
const toBps = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Math.round(Number(v) * 100); // % -> basis points
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

// Extrai leads/conversas de `actions` do insight.
function actionSum(actions: any[], types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  let sum = 0;
  for (const a of actions) if (types.includes(a?.action_type)) sum += Number(a?.value ?? 0);
  return Math.round(sum);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const connection_id = String(body.connection_id ?? "");
    const mode: "incremental" | "backfill" = body.mode === "backfill" ? "backfill" : "incremental";
    const onlyAssetId = body.asset_id ? String(body.asset_id) : null;
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
      const { data: user } = await admin
        .from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
      if (!user) return json({ error: "user_not_found" }, 403);
      const { data: membership } = await admin
        .from("user_organizations").select("id")
        .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
      if (!membership) return json({ error: "forbidden_org" }, 403);
    }

    const { data: conn } = await admin.from("meta_connections").select("id")
      .eq("id", connection_id).eq("organization_id", organization_id).maybeSingle();
    if (!conn) return json({ error: "connection_not_found" }, 404);

    // Ad accounts SELECIONADOS.
    let q = admin.from("meta_assets").select("id, external_id, metadata")
      .eq("connection_id", connection_id).eq("asset_type", "ad_account").eq("selection_state", "selected");
    if (onlyAssetId) q = q.eq("id", onlyAssetId);
    const { data: adAccounts } = await q;
    if (!adAccounts?.length) return json({ success: true, message: "no_selected_ad_accounts", assets: 0 });

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    const results: any[] = [];

    for (const acc of adAccounts) {
      const actId = acc.external_id; // act_...
      const currency = (acc.metadata as any)?.currency ?? null;
      const tz = (acc.metadata as any)?.timezone_name ?? null;

      const { data: run } = await admin.from("meta_sync_runs").insert({
        organization_id, connection_id, asset_id: acc.id, kind: "performance", mode,
        sync_version: SYNC_VERSION, parser_version: PARSER_VERSION, source_api_version: GRAPH_API_VERSION,
        status: "running",
      }).select("id").single();

      await admin.from("meta_sync_state").upsert({
        organization_id, connection_id, asset_id: acc.id, kind: "performance",
        sync_status: "running", error_class: null, error_message: null,
      }, { onConflict: "asset_id,kind" });

      const stats = { campaigns: 0, ad_sets: 0, ads: 0, creatives: 0, insights: 0 };
      try {
        // ---- Dimensões ----
        const campaigns = await graphPaginate(`/${actId}/campaigns`,
          { fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time", limit: 200 },
          accessToken, appSecret);
        const campMap = new Map<string, string>();
        for (const c of campaigns) {
          const { data } = await admin.from("meta_campaigns").upsert({
            organization_id, connection_id, ad_account_asset_id: acc.id,
            external_id: String(c.id), name: c.name ?? null, objective: c.objective ?? null,
            status: c.status ?? null, effective_status: c.effective_status ?? null,
            daily_budget_cents: toInt(c.daily_budget), lifetime_budget_cents: toInt(c.lifetime_budget),
            budget_currency: currency, start_time: c.start_time ?? null, stop_time: c.stop_time ?? null,
            created_time: c.created_time ?? null, updated_time: c.updated_time ?? null,
            raw: c, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
          }, { onConflict: "connection_id,external_id" }).select("id").single();
          if (data) campMap.set(String(c.id), data.id);
          stats.campaigns++;
        }

        const adsets = await graphPaginate(`/${actId}/adsets`,
          { fields: "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,start_time,end_time,targeting", limit: 200 },
          accessToken, appSecret);
        const adsetMap = new Map<string, string>();
        for (const s of adsets) {
          const { data } = await admin.from("meta_ad_sets").upsert({
            organization_id, connection_id, ad_account_asset_id: acc.id,
            campaign_id: s.campaign_id ? campMap.get(String(s.campaign_id)) ?? null : null,
            campaign_external_id: s.campaign_id ? String(s.campaign_id) : null,
            external_id: String(s.id), name: s.name ?? null, status: s.status ?? null,
            effective_status: s.effective_status ?? null, optimization_goal: s.optimization_goal ?? null,
            billing_event: s.billing_event ?? null, daily_budget_cents: toInt(s.daily_budget),
            lifetime_budget_cents: toInt(s.lifetime_budget), budget_currency: currency,
            start_time: s.start_time ?? null, end_time: s.end_time ?? null, targeting: s.targeting ?? null,
            raw: s, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
          }, { onConflict: "connection_id,external_id" }).select("id").single();
          if (data) adsetMap.set(String(s.id), data.id);
          stats.ad_sets++;
        }

        const ads = await graphPaginate(`/${actId}/ads`,
          { fields: "id,name,adset_id,campaign_id,status,effective_status,creative{id,name,title,body,thumbnail_url,object_story_spec},created_time,updated_time", limit: 200 },
          accessToken, appSecret);
        const adMap = new Map<string, string>();
        for (const ad of ads) {
          let creativeId: string | null = null;
          if (ad.creative?.id) {
            const cr = ad.creative;
            const { data: crRow } = await admin.from("meta_ad_creatives").upsert({
              organization_id, connection_id, ad_account_asset_id: acc.id,
              external_id: String(cr.id), name: cr.name ?? null, title: cr.title ?? null,
              body: cr.body ?? null, thumbnail_url: cr.thumbnail_url ?? null,
              object_story_spec: cr.object_story_spec ?? null,
              raw: cr, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
            }, { onConflict: "connection_id,external_id" }).select("id").single();
            if (crRow) { creativeId = crRow.id; stats.creatives++; }
          }
          const { data: adRow } = await admin.from("meta_ads").upsert({
            organization_id, connection_id, ad_account_asset_id: acc.id,
            ad_set_id: ad.adset_id ? adsetMap.get(String(ad.adset_id)) ?? null : null,
            campaign_id: ad.campaign_id ? campMap.get(String(ad.campaign_id)) ?? null : null,
            creative_id: creativeId,
            external_id: String(ad.id), ad_set_external_id: ad.adset_id ? String(ad.adset_id) : null,
            campaign_external_id: ad.campaign_id ? String(ad.campaign_id) : null,
            creative_external_id: ad.creative?.id ? String(ad.creative.id) : null,
            name: ad.name ?? null, status: ad.status ?? null, effective_status: ad.effective_status ?? null,
            created_time: ad.created_time ?? null, updated_time: ad.updated_time ?? null,
            raw: ad, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
          }, { onConflict: "connection_id,external_id" }).select("id").single();
          if (adRow) adMap.set(String(ad.id), adRow.id);
          stats.ads++;
        }

        // ---- Insights (nível ad, diário) ----
        // Janela: incremental usa checkpoint - 3d de lookback; backfill usa since do body (default 37 meses).
        const { data: state } = await admin.from("meta_sync_state").select("cursor,last_synced_at")
          .eq("asset_id", acc.id).eq("kind", "performance").maybeSingle();
        const until = new Date();
        let since = new Date();
        if (mode === "backfill") {
          since = body.since ? new Date(body.since) : new Date(Date.now() - 37 * 30 * 24 * 3600 * 1000);
        } else {
          const last = state?.last_synced_at ? new Date(state.last_synced_at) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
          since = new Date(last.getTime() - 3 * 24 * 3600 * 1000); // lookback de atribuição
        }

        const insights = await graphPaginate(`/${actId}/insights`, {
          level: "ad",
          fields: "ad_id,adset_id,campaign_id,impressions,clicks,inline_link_clicks,reach,spend,cpc,cpm,ctr,actions,date_start,date_stop",
          time_increment: 1,
          time_range: JSON.stringify({ since: dayStr(since), until: dayStr(until) }),
          limit: 200,
        }, accessToken, appSecret);

        for (const row of insights) {
          const actions = row.actions ?? [];
          await admin.from("meta_ad_insights").upsert({
            organization_id, connection_id, ad_account_asset_id: acc.id,
            level: "ad", entity_external_id: String(row.ad_id),
            ad_id: adMap.get(String(row.ad_id)) ?? null,
            date: row.date_start,
            impressions: toInt(row.impressions), clicks: toInt(row.clicks),
            inline_link_clicks: toInt(row.inline_link_clicks), reach: toInt(row.reach),
            spend_cents: toCents(row.spend), spend_currency: currency,
            cpc_cents: toCents(row.cpc), cpm_cents: toCents(row.cpm), ctr_basis_points: toBps(row.ctr),
            conversations_started: actionSum(actions, ["onsite_conversion.messaging_conversation_started_7d"]),
            leads_attributed: actionSum(actions, ["lead", "onsite_conversion.lead_grouped", "leadgen.other"]),
            actions, attribution_setting: null, account_timezone: tz,
            raw: row, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
          }, { onConflict: "connection_id,level,entity_external_id,date" });
          stats.insights++;
        }

        await admin.from("meta_sync_state").upsert({
          organization_id, connection_id, asset_id: acc.id, kind: "performance",
          sync_status: "idle", last_synced_at: until.toISOString(),
          cursor: { until: dayStr(until) }, error_class: null, error_message: null,
          counters: stats,
        }, { onConflict: "asset_id,kind" });
        await admin.from("meta_sync_runs").update({
          status: "success", completed_at: new Date().toISOString(), stats,
        }).eq("id", run?.id);
        results.push({ asset_id: acc.id, act: actId, ...stats });
      } catch (err) {
        const cls = classifyMetaError(err);
        await admin.from("meta_sync_state").upsert({
          organization_id, connection_id, asset_id: acc.id, kind: "performance",
          sync_status: "error", error_class: cls, error_message: (err as Error).message?.slice(0, 300),
        }, { onConflict: "asset_id,kind" });
        await admin.from("meta_sync_runs").update({
          status: "error", completed_at: new Date().toISOString(),
          error_class: cls, error_message: (err as Error).message?.slice(0, 300), stats,
        }).eq("id", run?.id);
        results.push({ asset_id: acc.id, act: actId, error: cls });
      }
    }

    return json({ success: true, mode, results });
  } catch (e) {
    console.error("meta-performance-sync error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
