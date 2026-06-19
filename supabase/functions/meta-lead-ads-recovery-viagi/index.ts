// One-shot recovery: refetch leads from a specific Meta lead form since a given time
// and dispatch them through meta-lead-ads-process-lead (with auto WhatsApp DISABLED).
//
// Modes:
//   { mode: "count" }                                           -> counts + sample, no writes
//   { mode: "apply", confirm_token: "VIAGI_RECOVERY_2026_06_19" } -> dispatches each lead
//
// Hardcoded for Viagi form 1390086283162407 since 2026-06-12 13:25:04 UTC.
// Disposable: delete after run.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

const FORM_ID = "1390086283162407";
const ORG_ID = "b246ef6f-6242-4011-a112-6d8783d2896a";
const PAGE_ID = "1c11568d-fd83-4d5a-8dfe-86aa4588ce00";
const SINCE_ISO = "2026-06-12T13:25:04Z"; // last_synced_lead_created_time
const CONFIRM_TOKEN = "VIAGI_RECOVERY_2026_06_19";
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // hard safety cap = 20k leads

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* ok */ }
  const mode: "count" | "apply" = body?.mode === "apply" ? "apply" : "count";
  const limit: number = Math.max(1, Math.min(100, Number(body?.limit) || 40));
  if (mode === "apply" && body?.confirm_token !== CONFIRM_TOKEN) {
    return json({ error: `apply mode requires confirm_token="${CONFIRM_TOKEN}"` }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Internal auth token for invoking sibling edge functions
  const { data: internalAuthToken, error: tokenErr } = await admin.rpc(
    "get_internal_function_auth_token",
  );
  if (tokenErr || !internalAuthToken) {
    return json({ error: "Internal auth token not available" }, 500);
  }

  // Load page + integration
  const { data: page } = await admin
    .from("meta_lead_pages")
    .select("id, page_access_token_encrypted, organization_integration_id")
    .eq("id", PAGE_ID)
    .maybeSingle();
  if (!page) return json({ error: "Page not found" }, 404);

  const { data: orgIntegration } = await admin
    .from("organization_integrations")
    .select("id, connected_account, config_values")
    .eq("id", page.organization_integration_id)
    .maybeSingle();
  if (!orgIntegration) return json({ error: "Integration not found" }, 404);

  const ca: any = orgIntegration.connected_account || {};
  const baseSettings = (orgIntegration.config_values as any)?.meta_lead_ads_settings || {};
  // User confirmed: keep auto_send_whatsapp + round-robin owner exactly as configured
  const settings = { ...baseSettings };

  let pageToken: string;
  let appSecret: string | undefined;
  try {
    pageToken = await decryptSecret(page.page_access_token_encrypted);
    appSecret = ca.app_secret_encrypted ? await decryptSecret(ca.app_secret_encrypted) : undefined;
  } catch (e: any) {
    return json({ error: `Failed to decrypt tokens: ${e.message}` }, 500);
  }

  const sinceUnix = Math.floor(new Date(SINCE_ISO).getTime() / 1000);

  // Form name
  const { data: form } = await admin
    .from("lead_forms")
    .select("id, provider_form_name")
    .eq("provider_form_id", FORM_ID)
    .eq("organization_id", ORG_ID)
    .maybeSingle();
  if (!form) return json({ error: "lead_form row not found" }, 404);

  const leads: any[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  let metaError: string | null = null;

  try {
    while (pagesFetched < MAX_PAGES) {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        filtering: JSON.stringify([
          { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
        ]),
        fields:
          "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic",
      };
      if (cursor) params.after = cursor;

      const resp = await metaGraphGet(`/${FORM_ID}/leads`, params, {
        accessToken: pageToken,
        appSecret,
      });
      const batch: any[] = resp.data || [];
      pagesFetched++;
      leads.push(...batch);
      cursor = resp.paging?.cursors?.after;
      if (!cursor || batch.length < PAGE_SIZE) break;
    }
  } catch (e: any) {
    metaError = e.message || String(e);
  }

  // Already-imported lead_ids (idempotency)
  // (a) Direct match by source_external_id
  const leadIds = leads.map((l) => l.id);
  const alreadyImported = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const slice = leadIds.slice(i, i + CHUNK);
    const { data } = await admin
      .from("contacts")
      .select("source_external_id")
      .eq("organization_id", ORG_ID)
      .in("source_external_id", slice);
    for (const r of data || []) if (r.source_external_id) alreadyImported.add(r.source_external_id);
  }

  // (b) Fallback: lead phone already exists as meta_lead_ads contact in this org
  const leadsByPhone = new Map<string, string[]>();
  for (const l of leads) {
    if (alreadyImported.has(l.id)) continue;
    const phoneField = (l.field_data || []).find((f: any) =>
      ["phone_number", "número_de_telefone", "numero_de_telefone", "telefone", "phone"].includes(f.name),
    );
    const raw = phoneField?.values?.[0];
    if (!raw) continue;
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length < 10) continue;
    const key = digits.length >= 12 && digits.startsWith("55") ? digits : `55${digits}`;
    if (!leadsByPhone.has(key)) leadsByPhone.set(key, []);
    leadsByPhone.get(key)!.push(l.id);
  }
  const allPhones = Array.from(leadsByPhone.keys());
  for (let i = 0; i < allPhones.length; i += CHUNK) {
    const slice = allPhones.slice(i, i + CHUNK);
    const { data } = await admin
      .from("contacts")
      .select("phone_normalized")
      .eq("organization_id", ORG_ID)
      .eq("source", "meta_lead_ads")
      .in("phone_normalized", slice);
    for (const r of data || []) {
      const ids = leadsByPhone.get(r.phone_normalized as string) || [];
      for (const id of ids) alreadyImported.add(id);
    }
  }

  const pendingLeads = leads.filter((l) => !alreadyImported.has(l.id));

  // Earliest / latest
  const sortedByTime = [...leads].sort((a, b) =>
    new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
  );
  const earliest = sortedByTime[0]?.created_time || null;
  const latest = sortedByTime[sortedByTime.length - 1]?.created_time || null;

  if (mode === "count") {
    return json({
      mode,
      organization_id: ORG_ID,
      form_id: FORM_ID,
      form_name: form.provider_form_name,
      since_iso: SINCE_ISO,
      pages_fetched: pagesFetched,
      reached_page_cap: pagesFetched >= MAX_PAGES,
      meta_error: metaError,
      totals: {
        leads_fetched_from_meta: leads.length,
        already_imported: alreadyImported.size,
        pending_to_import: pendingLeads.length,
      },
      window: { earliest_created_time: earliest, latest_created_time: latest },
      sample_pending: pendingLeads.slice(0, 5).map((l) => ({
        id: l.id,
        created_time: l.created_time,
        ad_name: l.ad_name,
        campaign_name: l.campaign_name,
        field_data: l.field_data,
      })),
    });
  }

  // APPLY — synchronous, capped by `limit` per invocation. Caller should re-invoke until pending=0.
  const batch = pendingLeads.slice(0, limit);
  const dispatched = { ok: 0, failed: 0, errors: [] as any[] };
  for (const lead of batch) {
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-lead-ads-process-lead`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalAuthToken}`,
        },
        body: JSON.stringify({
          lead,
          organization_id: ORG_ID,
          lead_form_id: form.id,
          lead_form_name: form.provider_form_name,
          settings,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        dispatched.failed++;
        if (dispatched.errors.length < 10) {
          dispatched.errors.push({ lead_id: lead.id, status: res.status, body: t.slice(0, 200) });
        }
      } else {
        dispatched.ok++;
      }
    } catch (e: any) {
      dispatched.failed++;
      if (dispatched.errors.length < 10) {
        dispatched.errors.push({ lead_id: lead.id, error: String(e).slice(0, 200) });
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const remaining = pendingLeads.length - batch.length;
  if (remaining === 0 && dispatched.ok > 0) {
    await admin
      .from("lead_forms")
      .update({
        last_sync_status: dispatched.failed === 0 ? "success" : "error",
        last_sync_error: dispatched.failed === 0 ? null : `${dispatched.failed} leads failed in recovery`,
        consecutive_errors: 0,
        last_synced_lead_created_time: latest,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", form.id);
  }

  return json({
    mode,
    pages_fetched: pagesFetched,
    meta_error: metaError,
    totals: {
      leads_fetched_from_meta: leads.length,
      already_imported: alreadyImported.size,
      pending_attempted: batch.length,
      remaining_after_this_batch: remaining,
    },
    dispatched,
  });
});
