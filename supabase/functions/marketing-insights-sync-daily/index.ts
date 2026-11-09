import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { appSecretProof } from "../_shared/meta-graph.ts";
import { listCanonicalAdsOrgIds, resolveOrgAdsAccess, syncAdAccountIds } from "../_shared/meta/ads-access.ts";
import { callerCanAccessOrg, resolveCaller } from "../_shared/auth/membership.ts";
import { converterGasto, lerPtax, ptaxUrl, type FxRate } from "../_shared/fx/ptax.ts";

const API_VERSION = "v25.0";
const GRAPH_TIMEOUT_MS = 30000;
const CONVERSATION_ACTION_TYPES = new Set([
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractConversations(actions: any): number {
  if (!Array.isArray(actions)) return 0;
  for (const a of actions) {
    if (CONVERSATION_ACTION_TYPES.has(a.action_type)) {
      return parseInt(a.value || "0", 10) || 0;
    }
  }
  return 0;
}

interface InsightDay {
  date: string;
  spend_cents: number;
  impressions: number;
  reach: number;
  clicks: number;
  inline_link_clicks: number;
  conversations_started: number;
  source_data: any;
}

async function graphFetchInsights(
  adId: string,
  token: string,
  since: string,
  until: string,
  appSecret?: string,
): Promise<{ ok: boolean; status: number; body: any }> {
  let url: string | null =
    `https://graph.facebook.com/${API_VERSION}/${adId}/insights` +
    `?fields=spend,account_currency,impressions,reach,clicks,inline_link_clicks,actions` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&time_increment=1` +
    `&access_token=${encodeURIComponent(token)}` +
    (appSecret ? `&appsecret_proof=${await appSecretProof(appSecret, token)}` : "");

  const allData: any[] = [];
  let lastStatus = 0;
  let lastBody: any = null;

  while (url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const body = await res.json().catch(() => ({}));
      lastStatus = res.status;
      lastBody = body;
      if (!res.ok) return { ok: false, status: res.status, body };
      if (Array.isArray(body.data)) allData.push(...body.data);
      url = body.paging?.next ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: true, status: lastStatus, body: { data: allData, _last: lastBody } };
}

function isRateLimit(status: number, body: any): boolean {
  if (status === 429) return true;
  const code = body?.error?.code;
  return code === 17 || code === 4 || code === 613;
}

function isTokenError(body: any): boolean {
  return body?.error?.code === 190;
}

function isAdDeleted(body: any): boolean {
  const code = body?.error?.code;
  const msg = String(body?.error?.message ?? "").toLowerCase();
  return code === 100 && msg.includes("does not exist");
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function processAd(
  admin: ReturnType<typeof createClient>,
  org: { id: string; currency: string },
  ad: { id: string; external_id: string; spend_currency: string | null },
  token: string,
  daysBack: number,
  appSecret?: string,
): Promise<{ days_inserted: number; status: "success" | "failed" | "skipped"; error?: string }> {
  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceStr = ymd(since);
  const untilStr = ymd(today);

  let attempt = 0;
  let result: { ok: boolean; status: number; body: any } | null = null;

  while (attempt < 2) {
    result = await graphFetchInsights(ad.external_id, token, sinceStr, untilStr, appSecret);
    if (result.ok) break;

    if (isTokenError(result.body)) {
      return { days_inserted: 0, status: "failed", error: "token_invalid" };
    }
    if (isAdDeleted(result.body)) {
      await admin
        .from("marketing_campaigns")
        .update({ status: "deleted", sync_error: "ad_not_found", updated_at: new Date().toISOString() })
        .eq("id", ad.id);
      return { days_inserted: 0, status: "skipped", error: "ad_deleted" };
    }
    if (isRateLimit(result.status, result.body) && attempt === 0) {
      attempt++;
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }
    // Other error
    await admin
      .from("marketing_campaigns")
      .update({
        sync_status: "failed",
        sync_error: String(result.body?.error?.message ?? `http_${result.status}`).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ad.id);
    return { days_inserted: 0, status: "failed", error: `meta_${result.status}` };
  }

  if (!result?.ok) {
    return { days_inserted: 0, status: "failed", error: "unknown" };
  }

  const data: any[] = result.body.data ?? [];
  if (data.length === 0) {
    return { days_inserted: 0, status: "success" };
  }

  // A Meta informa a moeda da conta em cada linha: é ela que vale, não o padrão do cadastro.
  const moedaConta = String(data[0]?.account_currency ?? ad.spend_currency ?? org.currency).toUpperCase();
  const cotacoes = moedaConta === org.currency ? [] : await cotacoesDe(admin, moedaConta, data.map((d) => d.date_start));

  const rows: any[] = [];
  for (const d of data) {
    const dailySpendCents = Math.round(parseFloat(d.spend ?? "0") * 100);
    const conversao = converterGasto({
      centavos: dailySpendCents, moedaConta, moedaOrg: org.currency, data: d.date_start, cotacoes,
    });
    // Sem cotação não grava: a linha fica como está e a próxima rodada tenta de novo.
    if (!conversao.ok) return { days_inserted: 0, status: "failed", error: `fx_${conversao.motivo}_${moedaConta}` };
    rows.push({
      organization_id: org.id,
      marketing_campaign_id: ad.id,
      date: d.date_start,
      spend_cents: conversao.spend_cents,
      spend_currency: moedaConta,
      spend_original_cents: dailySpendCents,
      fx_rate: conversao.fx_rate,
      fx_rate_date: conversao.fx_rate_date,
      impressions: parseInt(d.impressions ?? "0", 10) || 0,
      reach: parseInt(d.reach ?? "0", 10) || 0,
      clicks: parseInt(d.clicks ?? "0", 10) || 0,
      inline_link_clicks: parseInt(d.inline_link_clicks ?? "0", 10) || 0,
      conversations_started: extractConversations(d.actions),
      source_data: d,
      synced_at: new Date().toISOString(),
    });
  }

  if (ad.spend_currency !== moedaConta) {
    await admin.from("marketing_campaigns").update({ spend_currency: moedaConta }).eq("id", ad.id);
  }

  const { error: upErr } = await admin
    .from("marketing_campaign_insights_daily")
    .upsert(rows, { onConflict: "marketing_campaign_id,date" });

  if (upErr) {
    console.error("[insights-sync] upsert error", upErr.message);
    return { days_inserted: 0, status: "failed", error: `upsert: ${upErr.message}` };
  }

  console.log(
    "[insights-sync]",
    JSON.stringify({
      org_id: org.id,
      ad_id: ad.external_id,
      days_back: daysBack,
      days_returned: data.length,
      spend_total_cents: rows.reduce((s: number, r: any) => s + r.spend_cents, 0),
      retry_count: attempt,
      status: "success",
    }),
  );

  return { days_inserted: rows.length, status: "success" };
}

// Cotações por rodada: várias linhas e anúncios usam os mesmos dias.
const cotacoesEmMemoria = new Map<string, FxRate[]>();

/** Busca no Banco Central e guarda em fx_rates. Se ele não responder, usa o que já está guardado. */
async function cotacoesDe(admin: any, moeda: string, datas: string[]): Promise<FxRate[]> {
  const ate = datas.reduce((a, b) => (a > b ? a : b));
  const inicio = new Date(`${datas.reduce((a, b) => (a < b ? a : b))}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 7);
  const de = inicio.toISOString().slice(0, 10);
  const chave = `${moeda}|${de}|${ate}`;
  const pronta = cotacoesEmMemoria.get(chave);
  if (pronta) return pronta;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    const res = await fetch(ptaxUrl(moeda, de, ate), { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`bcb_${res.status}`);
    const novas = lerPtax(await res.json());
    if (novas.length > 0) {
      const { error } = await admin.from("fx_rates").upsert(
        novas.map((c) => ({ currency: moeda, ...c, fetched_at: new Date().toISOString() })),
        { onConflict: "currency,rate_date" },
      );
      if (error) console.warn("[insights-sync] fx_rates upsert", error.message);
    }
  } catch (e) {
    console.warn("[insights-sync] ptax", moeda, (e as Error).message);
  }

  const { data } = await admin.from("fx_rates").select("rate_date, rate_brl")
    .eq("currency", moeda).gte("rate_date", de).lte("rate_date", ate);
  const cotacoes = ((data ?? []) as any[]).map((c) => ({ rate_date: c.rate_date, rate_brl: Number(c.rate_brl) }));
  if (cotacoes.length > 0) cotacoesEmMemoria.set(chave, cotacoes);
  return cotacoes;
}

async function recalcLeadsForOrg(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  daysBack: number,
) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack - 1);

  const { data: contacts, error } = await admin
    .from("contacts")
    .select("marketing_campaign_id, created_at")
    .eq("organization_id", orgId)
    .not("marketing_campaign_id", "is", null)
    .is("deleted_at", null)
    .gte("created_at", since.toISOString());

  if (error) {
    console.error("[insights-sync] recalc leads fetch error", error.message);
    return;
  }
  if (!contacts || contacts.length === 0) return;

  const bucket = new Map<string, number>();
  for (const c of contacts as any[]) {
    if (!c.marketing_campaign_id) continue;
    const d = new Date(new Date(c.created_at).getTime() - 3 * 3600 * 1000);
    const dateStr = ymd(d);
    const key = `${c.marketing_campaign_id}|${dateStr}`;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }

  for (const [key, count] of bucket) {
    const [campaignId, dateStr] = key.split("|");
    await admin
      .from("marketing_campaign_insights_daily")
      .update({ leads_attributed: count, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("marketing_campaign_id", campaignId)
      .eq("date", dateStr);
  }
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

  // only_active: segunda rodada do dia, só com o que está gastando.
  let body: { organization_id?: string; days_back?: number; limit?: number; only_active?: boolean } = {};
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

  const daysBack = Math.max(1, Math.min(30, body.days_back ?? 7));
  const limit = Math.max(1, Math.min(500, body.limit ?? 100));
  const filterOrgId = body.organization_id;

  const orgs: { id: string }[] = [];
  if (filterOrgId) {
    orgs.push({ id: filterOrgId });
  } else {
    const { data: ois } = await admin
      .from("organization_integrations")
      .select("organization_id, config_values, admin_integrations!inner(slug)")
      .eq("is_enabled", true)
      .in("admin_integrations.slug", ["meta", "meta-lead-ads"]);
    const seen = new Set<string>();
    for (const oi of (ois ?? []) as any[]) {
      const enabled = oi.config_values?.feature_ads_manager_sync;
      if (enabled === false) continue;
      if (seen.has(oi.organization_id)) continue;
      seen.add(oi.organization_id);
      orgs.push({ id: oi.organization_id });
    }
    // Orgs só-canônicas (Meta Connection com ad account selecionada) também entram (dedupe por `seen`).
    for (const orgId of await listCanonicalAdsOrgIds(admin)) {
      if (seen.has(orgId)) continue;
      seen.add(orgId);
      orgs.push({ id: orgId });
    }
  }

  let adsProcessed = 0;
  let adsFailed = 0;
  let daysInserted = 0;
  let orgsProcessed = 0;
  const errors: any[] = [];

  for (const org of orgs) {
    // Regra única de credencial (canônico se flag ON ou sem legado; senão legado).
    const res = await resolveOrgAdsAccess(admin, org.id, { tag: "marketing-insights-sync-daily" });
    if (!res.ok) {
      if (res.reason === "creds_error") {
        errors.push({ org_id: org.id, error: res.message });
        continue;
      }
      // Mesma ordem de antes: sem config => ignora silenciosamente.
      const l = res.legacy;
      if (!l || !l.syncEnabled || !l.adAccountId) continue;
      errors.push({ org_id: org.id, error: res.reason === "decrypt_failed" ? "decrypt_failed" : "no_token" });
      continue;
    }
    const access = res.access;
    if (!access.syncEnabled || syncAdAccountIds(access).length === 0) continue;
    const token = access.token;
    // appsecret_proof só no canônico; legado idêntico ao de hoje.
    const proofSecret = access.source === "canonical" ? access.appSecret : undefined;
    const cred = { source: access.legacy?.source ?? null };

    let adsQuery = admin
      .from("marketing_campaigns")
      .select("id, external_id, spend_currency")
      .eq("organization_id", org.id)
      .eq("platform", "meta")
      .eq("sync_status", "success")
      .is("deleted_at", null)
      .not("external_id", "is", null);
    if (body.only_active === true) adsQuery = adsQuery.eq("status", "active");
    const { data: ads, error: adsErr } = await adsQuery.limit(limit);
    const { data: orgRow } = await admin.from("organizations").select("default_currency").eq("id", org.id).maybeSingle();
    const moedaOrg = String((orgRow as any)?.default_currency ?? "BRL").toUpperCase();

    if (adsErr) {
      errors.push({ org_id: org.id, error: `ads: ${adsErr.message}` });
      continue;
    }

    let tokenInvalid = false;
    for (const ad of (ads ?? []) as any[]) {
      const result = await processAd(admin, { id: org.id, currency: moedaOrg }, ad, token, daysBack, proofSecret);
      if (result.status === "success") {
        adsProcessed++;
        daysInserted += result.days_inserted;
      } else if (result.status === "failed") {
        adsFailed++;
        errors.push({ org_id: org.id, ad_id: ad.external_id, error: result.error });
        if (result.error === "token_invalid") {
          tokenInvalid = true;
          // Marca erro de token só na linha LEGADA; no canônico a saúde é da Meta Connection.
          const { data: integ } = access.source !== "legacy" ? { data: null } : await admin
            .from("admin_integrations")
            .select("id")
            .eq("slug", cred.source === "meta" ? "meta" : "meta-lead-ads")
            .maybeSingle();
          if (integ?.id) {
            const { data: oi } = await admin
              .from("organization_integrations")
              .select("id, connected_account")
              .eq("organization_id", org.id)
              .eq("integration_id", integ.id)
              .maybeSingle();
            if (oi?.id) {
              const merged = {
                ...(oi.connected_account ?? {}),
                last_token_check_at: new Date().toISOString(),
                last_token_check_error: "Invalid OAuth access token (190)",
              };
              await admin
                .from("organization_integrations")
                .update({ connected_account: merged, updated_at: new Date().toISOString() })
                .eq("id", oi.id);
            }
          }
          break;
        }
      }
    }

    if (!tokenInvalid) {
      await recalcLeadsForOrg(admin, org.id, daysBack);
    }

    orgsProcessed++;
  }

  return json({
    success: true,
    orgs_processed: orgsProcessed,
    ads_processed: adsProcessed,
    ads_failed: adsFailed,
    days_inserted: daysInserted,
    errors,
  });
});
