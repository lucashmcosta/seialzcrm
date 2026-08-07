// meta-capability-test — bateria READ-ONLY de capabilities da conexão Meta.
// NENHUMA mutação (sem publish/edição/mensagem/webhook). Usa o token da conexão
// (+ page access token p/ leitura de Página). Retorna matriz por capability:
// READY | MISSING_PERMISSION | NO_ASSET | API_LIMITATION. Auth: x-sync-token (serviço).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppSecret, resolveConnectionToken } from "../_shared/meta/connection.ts";
import { metaGraphGet, MetaGraphError } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Verdict = "READY" | "MISSING_PERMISSION" | "NO_ASSET" | "API_LIMITATION";

function classify(err: unknown): Verdict {
  if (err instanceof MetaGraphError) {
    const c = err.error.code ?? 0;
    if ([10, 200, 3, 190, 102, 294, 278].includes(c)) return "MISSING_PERMISSION";
    if ([100, 12, 2635].includes(c)) return "API_LIMITATION"; // param/deprecação
    return "API_LIMITATION";
  }
  return "API_LIMITATION";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const connection_id = String(body.connection_id ?? "");
    const svc = req.headers.get("x-sync-token");
    if (!svc || svc !== Deno.env.get("META_SYNC_TRIGGER_TOKEN")) return json({ error: "unauthorized" }, 401);
    if (!organization_id || !connection_id) return json({ error: "missing_fields" }, 400);

    const token = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    const opts = { accessToken: token, appSecret };

    const { data: assets } = await admin.from("meta_assets")
      .select("asset_type, external_id, name").eq("connection_id", connection_id);
    const adAccount = assets?.find((a: any) => a.asset_type === "ad_account");
    const page = assets?.find((a: any) => a.asset_type === "page");
    const ig = assets?.find((a: any) => a.asset_type === "instagram_account");

    const results: any[] = [];
    const run = async (
      capability: string, permission: string, endpoint: string,
      asset: string | null, fn: (() => Promise<{ count?: number }>) | null,
    ) => {
      if (fn === null) { results.push({ capability, permission, endpoint, asset, verdict: "NO_ASSET" }); return; }
      try {
        const r = await fn();
        results.push({ capability, permission, endpoint, asset, verdict: "READY", found: r?.count ?? null });
      } catch (e) {
        results.push({ capability, permission, endpoint, asset, verdict: classify(e), detail: (e as Error).message?.slice(0, 120) });
      }
    };

    // Page access token (para leituras de Página)
    let pageToken: string | null = null;
    if (page) {
      try {
        const pt = await metaGraphGet(`/${page.external_id}`, { fields: "access_token" }, opts);
        pageToken = pt?.access_token ?? null;
      } catch (_) { /* */ }
    }
    const pageOpts = pageToken ? { accessToken: pageToken, appSecret } : opts;
    const actId = adAccount?.external_id;

    // ---------- PERFORMANCE ----------
    await run("Businesses", "business_management", "/me/businesses", null,
      async () => ({ count: (await metaGraphGet("/me/businesses", { fields: "id", limit: 5 }, opts)).data?.length ?? 0 }));
    await run("Ad Accounts", "ads_read", "/me/adaccounts", null,
      async () => ({ count: (await metaGraphGet("/me/adaccounts", { fields: "id", limit: 5 }, opts)).data?.length ?? 0 }));
    await run("Campaigns", "ads_read", `/{act}/campaigns`, actId ?? null,
      actId ? async () => ({ count: (await metaGraphGet(`/${actId}/campaigns`, { fields: "id,name", limit: 3 }, opts)).data?.length ?? 0 }) : null);
    await run("Ad Sets", "ads_read", `/{act}/adsets`, actId ?? null,
      actId ? async () => ({ count: (await metaGraphGet(`/${actId}/adsets`, { fields: "id", limit: 3 }, opts)).data?.length ?? 0 }) : null);
    await run("Ads", "ads_read", `/{act}/ads`, actId ?? null,
      actId ? async () => ({ count: (await metaGraphGet(`/${actId}/ads`, { fields: "id", limit: 3 }, opts)).data?.length ?? 0 }) : null);
    await run("Creatives", "ads_read", `/{act}/adcreatives`, actId ?? null,
      actId ? async () => ({ count: (await metaGraphGet(`/${actId}/adcreatives`, { fields: "id", limit: 3 }, opts)).data?.length ?? 0 }) : null);
    await run("Insights", "ads_read", `/{act}/insights`, actId ?? null,
      actId ? async () => ({ count: (await metaGraphGet(`/${actId}/insights`, { fields: "impressions", date_preset: "last_7d", limit: 3 }, opts)).data?.length ?? 0 }) : null);
    await run("Pixels", "ads_read/business_management", `/{act}/adspixels`, actId ?? null,
      actId ? async () => ({ count: (await metaGraphGet(`/${actId}/adspixels`, { fields: "id,name", limit: 3 }, opts)).data?.length ?? 0 }) : null);

    // ---------- ORGANIC ----------
    await run("Pages", "pages_show_list", "/me/accounts", null,
      async () => ({ count: (await metaGraphGet("/me/accounts", { fields: "id", limit: 5 }, opts)).data?.length ?? 0 }));
    await run("Instagram Accounts", "instagram_basic", `/{page}?instagram_business_account`, page?.external_id ?? null,
      page ? async () => {
        const r = await metaGraphGet(`/${page.external_id}`, { fields: "instagram_business_account{id,username}" }, pageOpts);
        return { count: r?.instagram_business_account ? 1 : 0 };
      } : null);
    await run("Page posts/media", "pages_read_engagement", `/{page}/published_posts`, page?.external_id ?? null,
      page ? async () => ({ count: (await metaGraphGet(`/${page.external_id}/published_posts`, { fields: "id", limit: 3 }, pageOpts)).data?.length ?? 0 }) : null);
    await run("Instagram media", "instagram_basic", `/{ig}/media`, ig?.external_id ?? null,
      ig ? async () => ({ count: (await metaGraphGet(`/${ig.external_id}/media`, { fields: "id,media_type", limit: 3 }, opts)).data?.length ?? 0 }) : null);
    await run("Reels (page)", "pages_read_engagement", `/{page}/video_reels`, page?.external_id ?? null,
      page ? async () => ({ count: (await metaGraphGet(`/${page.external_id}/video_reels`, { limit: 3 }, pageOpts)).data?.length ?? 0 }) : null);
    await run("Page insights", "read_insights", `/{page}/insights`, page?.external_id ?? null,
      page ? async () => ({ count: (await metaGraphGet(`/${page.external_id}/insights`, { metric: "page_impressions_unique", period: "days_28" }, pageOpts)).data?.length ?? 0 }) : null);
    await run("Instagram insights", "instagram_manage_insights", `/{ig}/insights`, ig?.external_id ?? null,
      ig ? async () => ({ count: (await metaGraphGet(`/${ig.external_id}/insights`, { metric: "reach", period: "day" }, opts)).data?.length ?? 0 }) : null);

    // ---------- LEAD ADS ----------
    await run("Lead Ads — pages", "pages_show_list", "/me/accounts", null,
      async () => ({ count: (await metaGraphGet("/me/accounts", { fields: "id", limit: 5 }, opts)).data?.length ?? 0 }));
    let firstFormId: string | null = null;
    await run("Lead Ads — leadgen forms", "pages_manage_metadata", `/{page}/leadgen_forms`, page?.external_id ?? null,
      page ? async () => {
        const r = await metaGraphGet(`/${page.external_id}/leadgen_forms`, { fields: "id,name", limit: 3 }, pageOpts);
        firstFormId = r?.data?.[0]?.id ?? null;
        return { count: r?.data?.length ?? 0 };
      } : null);
    // Leitura real de leads (só contagem; NENHUM dado de lead é retornado/logado).
    await run("Lead Ads — leitura de leads", "leads_retrieval", `/{form}/leads`, firstFormId,
      firstFormId ? async () => ({ count: (await metaGraphGet(`/${firstFormId}/leads`, { fields: "id,created_time", limit: 1 }, pageOpts)).data?.length ?? 0 }) : null);

    const summary = results.reduce((a: Record<string, number>, r) => { a[r.verdict] = (a[r.verdict] ?? 0) + 1; return a; }, {});
    return json({ success: true, connection_id, page_token_available: Boolean(pageToken), summary, results });
  } catch (e) {
    console.error("meta-capability-test error", (e as Error).message);
    return json({ error: "internal_error", detail: (e as Error).message?.slice(0, 120) }, 500);
  }
});
