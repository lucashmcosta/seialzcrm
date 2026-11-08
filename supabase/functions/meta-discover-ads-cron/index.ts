import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { appSecretProof } from "../_shared/meta-graph.ts";
import { listCanonicalAdsOrgIds, resolveOrgAdsAccess, syncAdAccountIds } from "../_shared/meta/ads-access.ts";
import { callerCanAccessOrg, resolveCaller } from "../_shared/auth/membership.ts";

const API_VERSION = "v25.0";
const GRAPH_TIMEOUT_MS = 30000;
const AD_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "campaign{id,name,objective}",
  "adset{id,name}",
  "creative{id,name,title,body,thumbnail_url,object_story_spec}",
  "updated_time",
].join(",");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MetaAd {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign?: { id: string; name?: string; objective?: string };
  adset?: { id: string; name?: string };
  creative?: {
    id: string;
    name?: string;
    title?: string;
    body?: string;
    thumbnail_url?: string;
    object_story_spec?: any;
  };
  updated_time?: string;
}

async function fetchAllAds(
  adAccountId: string,
  token: string,
  appSecret?: string,
): Promise<{ ok: boolean; ads: MetaAd[]; error?: any; status?: number }> {
  const ads: MetaAd[] = [];
  let url: string | null =
    `https://graph.facebook.com/${API_VERSION}/${adAccountId}/ads` +
    `?fields=${encodeURIComponent(AD_FIELDS)}` +
    `&limit=100` +
    `&access_token=${encodeURIComponent(token)}` +
    (appSecret ? `&appsecret_proof=${await appSecretProof(appSecret, token)}` : "");

  let pages = 0;
  while (url && pages < 50) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, ads, error: body, status: res.status };
      }
      if (Array.isArray(body.data)) ads.push(...body.data);
      url = body.paging?.next ?? null;
      pages++;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: true, ads };
}

function mapStatus(s?: string | null): string {
  if (!s) return "unknown";
  const u = s.toUpperCase();
  if (u === "ACTIVE") return "active";
  if (u === "PAUSED" || u === "CAMPAIGN_PAUSED" || u === "ADSET_PAUSED") return "paused";
  if (u === "ARCHIVED") return "archived";
  if (u === "DELETED") return "deleted";
  return "unknown";
}

function extractDestinationUrl(creative: any): string | null {
  const oss = creative?.object_story_spec;
  if (!oss) return null;
  return (
    oss.link_data?.link ??
    oss.video_data?.call_to_action?.value?.link ??
    oss.template_data?.link ??
    null
  );
}

async function processOrg(
  admin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<{
  org_id: string;
  status: "success" | "failed" | "skipped";
  ads_discovered: number;
  ads_created: number;
  ads_archived: number;
  error?: string;
}> {
  // Regra única de credencial (canônico se flag ON ou sem legado; senão legado).
  const res = await resolveOrgAdsAccess(admin, orgId, { tag: "meta-discover-ads-cron" });
  if (!res.ok) {
    if (res.reason === "creds_error") return { org_id: orgId, status: "failed", ads_discovered: 0, ads_created: 0, ads_archived: 0, error: res.message };
    // Mantém a ordem de checagem de antes: config ausente => skipped antes de qualquer erro de token.
    const l = res.legacy;
    if (!l || !l.syncEnabled || !l.adAccountId) {
      return { org_id: orgId, status: "skipped", ads_discovered: 0, ads_created: 0, ads_archived: 0, error: "not_configured" };
    }
    if (res.reason === "decrypt_failed") return { org_id: orgId, status: "failed", ads_discovered: 0, ads_created: 0, ads_archived: 0, error: "decrypt_failed" };
    // no_credential: tinha config legada mas nenhum token (nem legado nem canônico).
    return { org_id: orgId, status: "failed", ads_discovered: 0, ads_created: 0, ads_archived: 0, error: "no_token" };
  }
  const access = res.access;
  const adAccountIds = syncAdAccountIds(access);
  if (!access.syncEnabled || adAccountIds.length === 0) {
    return { org_id: orgId, status: "skipped", ads_discovered: 0, ads_created: 0, ads_archived: 0, error: "not_configured" };
  }
  const token = access.token;
  // appsecret_proof só no canônico; legado idêntico ao de hoje.
  const proofSecret = access.source === "canonical" ? access.appSecret : undefined;

  // Canônico pode ter >1 ad account selecionada: une os anúncios antes do upsert/arquivamento
  // (arquivar só com a lista COMPLETA; qualquer falha aborta a org sem arquivar nada).
  const allAds: MetaAd[] = [];
  for (const actId of adAccountIds) {
    const r = await fetchAllAds(actId, token, proofSecret);
    if (!r.ok) {
      const msg = r.error?.error?.message ?? `http_${r.status}`;
      return { org_id: orgId, status: "failed", ads_discovered: 0, ads_created: 0, ads_archived: 0, error: String(msg).slice(0, 300) };
    }
    allAds.push(...r.ads);
  }
  const byId = new Map<string, MetaAd>();
  for (const ad of allAds) byId.set(ad.id, ad);
  const result = { ok: true, ads: [...byId.values()] };
  const normalizedAdAccountId = adAccountIds.join(",");

  const { data: existing } = await admin
    .from("marketing_campaigns")
    .select("id, external_id, status")
    .eq("organization_id", orgId)
    .eq("platform", "meta")
    .is("deleted_at", null);

  const existingByExt = new Map<string, { id: string; status: string | null }>();
  for (const r of (existing ?? []) as any[]) {
    if (r.external_id) existingByExt.set(r.external_id, { id: r.id, status: r.status });
  }

  const seen = new Set<string>();
  const rows = result.ads.map((ad) => {
    seen.add(ad.id);
    const creative = ad.creative ?? {};
    const dest = extractDestinationUrl(creative);
    return {
      organization_id: orgId,
      platform: "meta" as const,
      channel: "ctwa",
      external_id: ad.id,
      ad_id: ad.id,
      ad_name: ad.name ?? null,
      campaign_id: ad.campaign?.id ?? null,
      campaign_name: ad.campaign?.name ?? null,
      campaign_objective: ad.campaign?.objective ?? null,
      adset_id: ad.adset?.id ?? null,
      adset_name: ad.adset?.name ?? null,
      creative_id: creative.id ?? null,
      creative_name: creative.name ?? null,
      creative_headline: creative.title ?? null,
      creative_body: creative.body ?? null,
      creative_thumbnail_url: creative.thumbnail_url ?? null,
      destination_url: dest,
      display_name: ad.name ?? null,
      display_hierarchy: [ad.campaign?.name, ad.adset?.name, ad.name].filter(Boolean).join(" › "),
      status: mapStatus(ad.effective_status ?? ad.status),
      sync_status: "success",
      sync_error: null,
      last_synced_at: new Date().toISOString(),
      platform_data: ad,
      updated_at: new Date().toISOString(),
    };
  });

  let adsCreated = 0;
  if (rows.length > 0) {
    for (const ad of result.ads) if (!existingByExt.has(ad.id)) adsCreated++;
    const { error: upErr } = await admin
      .from("marketing_campaigns")
      .upsert(rows, { onConflict: "organization_id,platform,external_id" });
    if (upErr) {
      return { org_id: orgId, status: "failed", ads_discovered: result.ads.length, ads_created: 0, ads_archived: 0, error: `upsert: ${upErr.message}` };
    }
  }

  let adsArchived = 0;
  const stale: string[] = [];
  for (const [extId, row] of existingByExt) {
    if (!seen.has(extId) && row.status !== "archived" && row.status !== "deleted") {
      stale.push(row.id);
    }
  }
  if (stale.length > 0) {
    const { error: archErr } = await admin
      .from("marketing_campaigns")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("id", stale);
    if (!archErr) adsArchived = stale.length;
  }

  console.log("[discover-ads]", JSON.stringify({
    org_id: orgId,
    ad_account_id: normalizedAdAccountId,
    ads_discovered: result.ads.length,
    ads_created: adsCreated,
    ads_archived: adsArchived,
  }));

  return {
    org_id: orgId,
    status: "success",
    ads_discovered: result.ads.length,
    ads_created: adsCreated,
    ads_archived: adsArchived,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await resolveCaller(req, admin);
  if (!caller.ok) {
    return json({ success: false, error_code: "unauthorized" }, 401);
  }

  let body: { organization_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // JWT de usuário: só a própria org (membro ativo) e nunca o modo "todas as orgs"
  // (sem organization_id), que é exclusivo do cron (service/internal — inalterado).
  if (caller.kind === "user") {
    const reqOrg = typeof body.organization_id === "string" ? body.organization_id : "";
    if (!reqOrg || !(await callerCanAccessOrg(admin, caller, reqOrg))) {
      return json({ success: false, error_code: "forbidden_org" }, 403);
    }
  }

  const orgs: { id: string }[] = [];
  if (body.organization_id) {
    orgs.push({ id: body.organization_id });
  } else {
    const { data: ois } = await admin
      .from("organization_integrations")
      .select("organization_id, config_values, admin_integrations!inner(slug)")
      .eq("is_enabled", true)
      .in("admin_integrations.slug", ["meta", "meta-lead-ads"]);
    const seen = new Set<string>();
    for (const oi of (ois ?? []) as any[]) {
      if (oi.config_values?.feature_ads_manager_sync === false) continue;
      if (seen.has(oi.organization_id)) continue;
      seen.add(oi.organization_id);
      orgs.push({ id: oi.organization_id });
    }
    // Orgs só-canônicas (Meta Connection com ad account selecionada) também entram.
    // Dedupe pelo mesmo `seen`; a decisão legado×canônico é por org em processOrg.
    for (const orgId of await listCanonicalAdsOrgIds(admin)) {
      if (seen.has(orgId)) continue;
      seen.add(orgId);
      orgs.push({ id: orgId });
    }
  }

  const results: any[] = [];
  let totalDiscovered = 0;
  let totalCreated = 0;
  let totalArchived = 0;
  let orgsFailed = 0;

  for (const org of orgs) {
    const r = await processOrg(admin, org.id);
    results.push(r);
    totalDiscovered += r.ads_discovered;
    totalCreated += r.ads_created;
    totalArchived += r.ads_archived;
    if (r.status === "failed") orgsFailed++;
  }

  return json({
    success: true,
    orgs_processed: orgs.length,
    orgs_failed: orgsFailed,
    ads_discovered: totalDiscovered,
    ads_created: totalCreated,
    ads_archived: totalArchived,
    results,
  });
});
