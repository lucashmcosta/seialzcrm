import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";

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

async function validateAuth(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.replace("Bearer ", "").trim();
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const { data: internal } = await admin.rpc("get_internal_function_auth_token");
    if (internal && token === internal) return true;
  } catch (_e) { /* ignore */ }
  try {
    const { data, error } = await admin.auth.getClaims(token);
    if (!error && data?.claims?.sub) return true;
  } catch (_e) { /* ignore */ }
  return false;
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
): Promise<{ ok: boolean; status: number; body: any }> {
  let url: string | null =
    `https://graph.facebook.com/${API_VERSION}/${adId}/insights` +
    `?fields=spend,impressions,reach,clicks,inline_link_clicks,actions` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&time_increment=1` +
    `&access_token=${encodeURIComponent(token)}`;

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
  org: { id: string },
  ad: { id: string; external_id: string; spend_currency: string | null },
  token: string,
  daysBack: number,
): Promise<{ days_inserted: number; status: "success" | "failed" | "skipped"; error?: string }> {
  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceStr = ymd(since);
  const untilStr = ymd(today);

  let attempt = 0;
  let result: { ok: boolean; status: number; body: any } | null = null;

  while (attempt < 2) {
    result = await graphFetchInsights(ad.external_id, token, sinceStr, untilStr);
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

  const rows = data.map((d): any => {
    const dailySpendCents = Math.round(parseFloat(d.spend ?? "0") * 100);
    return {
      organization_id: org.id,
      marketing_campaign_id: ad.id,
      date: d.date_start,
      spend_cents: dailySpendCents,
      spend_currency: ad.spend_currency ?? "BRL",
      impressions: parseInt(d.impressions ?? "0", 10) || 0,
      reach: parseInt(d.reach ?? "0", 10) || 0,
      clicks: parseInt(d.clicks ?? "0", 10) || 0,
      inline_link_clicks: parseInt(d.inline_link_clicks ?? "0", 10) || 0,
      conversations_started: extractConversations(d.actions),
      source_data: d,
      synced_at: new Date().toISOString(),
    };
  });

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

  if (!(await validateAuth(req, admin))) {
    return json({ success: false, error_code: "unauthorized" }, 401);
  }

  let body: { organization_id?: string; days_back?: number; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
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
  }

  let adsProcessed = 0;
  let adsFailed = 0;
  let daysInserted = 0;
  let orgsProcessed = 0;
  const errors: any[] = [];

  for (const org of orgs) {
    const { data: credRows, error: credErr } = await admin.rpc("get_meta_credentials", {
      p_org_id: org.id,
    });
    if (credErr) {
      errors.push({ org_id: org.id, error: `creds: ${credErr.message}` });
      continue;
    }
    const cred = credRows?.[0];
    if (!cred?.is_connected || !cred.feature_ads_manager_sync || !cred.ad_account_id) {
      continue;
    }
    if (!cred.system_user_token_encrypted) {
      errors.push({ org_id: org.id, error: "no_token" });
      continue;
    }

    let token: string;
    try {
      token = await decryptSecret(cred.system_user_token_encrypted);
    } catch (e) {
      errors.push({ org_id: org.id, error: "decrypt_failed" });
      continue;
    }

    const { data: ads, error: adsErr } = await admin
      .from("marketing_campaigns")
      .select("id, external_id, spend_currency")
      .eq("organization_id", org.id)
      .eq("platform", "meta")
      .eq("sync_status", "success")
      .is("deleted_at", null)
      .not("external_id", "is", null)
      .limit(limit);

    if (adsErr) {
      errors.push({ org_id: org.id, error: `ads: ${adsErr.message}` });
      continue;
    }

    let tokenInvalid = false;
    for (const ad of (ads ?? []) as any[]) {
      const result = await processAd(admin, org, ad, token, daysBack);
      if (result.status === "success") {
        adsProcessed++;
        daysInserted += result.days_inserted;
      } else if (result.status === "failed") {
        adsFailed++;
        errors.push({ org_id: org.id, ad_id: ad.external_id, error: result.error });
        if (result.error === "token_invalid") {
          tokenInvalid = true;
          const { data: integ } = await admin
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
