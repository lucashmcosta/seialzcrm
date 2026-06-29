// Generalized recovery for Viagi's Meta Lead Ads forms.
//
// Modes:
//   { mode: "count" }
//     -> read-only: per-form counts, dedup breakdown, 10-sample, CRM cross-check.
//   { mode: "apply", confirm_token: "VIAGI_RECOVERY_2026_06_19", form_id?, limit? }
//     -> dispatches pending leads through meta-lead-ads-process-lead (auto WhatsApp kept as configured).
//
// Optional body fields:
//   fallback_since_iso : ISO timestamp used when a form has no last_synced_lead_created_time.
//   since_override_iso : forces this `since` for ALL forms (debugging / wider window).
//   form_id            : restrict apply mode to a single form.
//
// Hardcoded to Viagi org. Disposable.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

const ORG_ID = "b246ef6f-6242-4011-a112-6d8783d2896a";
const PAGE_ROW_ID = "1c11568d-fd83-4d5a-8dfe-86aa4588ce00";
const CONFIRM_TOKEN = "VIAGI_RECOVERY_2026_06_19";
const DEFAULT_FALLBACK_SINCE = "2026-06-12T13:25:04Z";
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // 20k leads safety cap

const PHONE_FIELDS = ["phone_number", "número_de_telefone", "numero_de_telefone", "telefone", "phone"];
const NAME_FIELDS = ["full_name", "nome_completo", "nome", "name", "first_name"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractField(field_data: any[], names: string[]): string | null {
  if (!Array.isArray(field_data)) return null;
  const m = field_data.find((f: any) => names.includes(String(f?.name || "").toLowerCase()));
  const v = m?.values?.[0];
  return v ? String(v) : null;
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length >= 12 && digits.startsWith("55") ? digits : `55${digits}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* ok */ }
  const mode: "count" | "apply" = body?.mode === "apply" ? "apply" : "count";
  const limit: number = Math.max(1, Math.min(100, Number(body?.limit) || 40));
  const fallbackSince: string = body?.fallback_since_iso || DEFAULT_FALLBACK_SINCE;
  const sinceOverride: string | undefined = body?.since_override_iso;
  const restrictFormId: string | undefined = body?.form_id;

  if (mode === "apply" && body?.confirm_token !== CONFIRM_TOKEN) {
    return json({ error: `apply mode requires confirm_token="${CONFIRM_TOKEN}"` }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: page } = await admin
    .from("meta_lead_pages")
    .select("id, page_access_token_encrypted, organization_integration_id")
    .eq("id", PAGE_ROW_ID)
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
  const settings = { ...baseSettings };

  let pageToken: string;
  let appSecret: string | undefined;
  try {
    pageToken = await decryptSecret(page.page_access_token_encrypted);
    appSecret = ca.app_secret_encrypted ? await decryptSecret(ca.app_secret_encrypted) : undefined;
  } catch (e: any) {
    return json({ error: `Failed to decrypt tokens: ${e.message}` }, 500);
  }

  // Load forms
  let formsQuery = admin
    .from("lead_forms")
    .select("id, provider_form_id, provider_form_name, last_synced_lead_created_time, meta_lead_page_id, is_monitored")
    .eq("organization_id", ORG_ID)
    .eq("provider", "meta_lead_ads")
    .eq("meta_lead_page_id", PAGE_ROW_ID);
  if (restrictFormId) formsQuery = formsQuery.eq("provider_form_id", restrictFormId);
  const { data: formsList, error: formsErr } = await formsQuery;
  if (formsErr || !formsList || formsList.length === 0) {
    return json({ error: "No lead_forms matched", details: formsErr?.message }, 404);
  }

  const formReports: any[] = [];
  let internalAuthToken: string | null = null;
  if (mode === "apply") {
    const { data: t, error: tErr } = await admin.rpc("get_internal_function_auth_token");
    if (tErr || !t) return json({ error: "Internal auth token not available" }, 500);
    internalAuthToken = t as string;
  }

  // For CRM cross-check (per form)
  for (const form of formsList) {
    const sinceIso =
      sinceOverride ||
      (form.last_synced_lead_created_time
        ? new Date(form.last_synced_lead_created_time as string).toISOString()
        : fallbackSince);
    const sinceUnix = Math.floor(new Date(sinceIso).getTime() / 1000);

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
        const resp = await metaGraphGet(`/${form.provider_form_id}/leads`, params, {
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

    // Dedup breakdown
    const leadIds = leads.map((l) => l.id);
    const dupByExternal = new Set<string>();
    const CHUNK = 500;
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const slice = leadIds.slice(i, i + CHUNK);
      const { data } = await admin
        .from("contacts")
        .select("source_external_id")
        .eq("organization_id", ORG_ID)
        .in("source_external_id", slice);
      for (const r of data || []) if (r.source_external_id) dupByExternal.add(r.source_external_id);
    }

    // Build phone map for leads not yet caught by external id
    const leadsByPhone = new Map<string, string[]>();
    for (const l of leads) {
      if (dupByExternal.has(l.id)) continue;
      const raw = extractField(l.field_data || [], PHONE_FIELDS);
      const key = normalizePhone(raw);
      if (!key) continue;
      if (!leadsByPhone.has(key)) leadsByPhone.set(key, []);
      leadsByPhone.get(key)!.push(l.id);
    }
    const dupByPhone = new Set<string>();
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
        for (const id of ids) dupByPhone.add(id);
      }
    }

    const alreadyImportedIds = new Set<string>([...dupByExternal, ...dupByPhone]);
    const pendingLeads = leads.filter((l) => !alreadyImportedIds.has(l.id));

    // CRM cross-check: how many CRM contacts for this org have source=meta_lead_ads with form metadata
    // Use marketing_form_id when available; fall back to count of contacts whose source_external_id is in the leads set.
    const { count: crmContactsFromGraph } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .in("source_external_id", leadIds.length > 0 ? leadIds : ["__none__"]);

    const sample = pendingLeads.slice(0, 10).map((l) => ({
      lead_id: l.id,
      created_time: l.created_time,
      phone: extractField(l.field_data || [], PHONE_FIELDS),
      full_name: extractField(l.field_data || [], NAME_FIELDS),
      ad_name: l.ad_name,
      campaign_name: l.campaign_name,
    }));

    const formReport: any = {
      provider_form_id: form.provider_form_id,
      form_name: form.provider_form_name,
      meta_lead_page_id: form.meta_lead_page_id,
      since_iso_used: sinceIso,
      since_source: sinceOverride
        ? "since_override_iso"
        : form.last_synced_lead_created_time
        ? "last_synced_lead_created_time"
        : "fallback_since_iso",
      pages_fetched: pagesFetched,
      reached_page_cap: pagesFetched >= MAX_PAGES,
      meta_error: metaError,
      graph_total_fetched: leads.length,
      already_imported: alreadyImportedIds.size,
      would_import: pendingLeads.length,
      duplicates_by_source_external_id: dupByExternal.size,
      duplicates_by_phone_normalized: dupByPhone.size,
      remaining_after_import: 0, // count mode = nothing applied, so post-apply remaining would be 0
      crm_cross_check: {
        graph_fetched: leads.length,
        crm_contacts_matching_graph_lead_ids: crmContactsFromGraph ?? 0,
        missing_in_crm: leads.length - (crmContactsFromGraph ?? 0),
      },
      sample_would_import: sample,
    };

    if (mode === "apply") {
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
      formReport.applied = {
        attempted: batch.length,
        ok: dispatched.ok,
        failed: dispatched.failed,
        remaining_after_this_batch: pendingLeads.length - batch.length,
        errors: dispatched.errors,
      };
    }

    formReports.push(formReport);
  }

  return json({
    mode,
    organization_id: ORG_ID,
    page_row_id: PAGE_ROW_ID,
    fallback_since_iso: fallbackSince,
    since_override_iso: sinceOverride ?? null,
    idempotency: {
      strategies: [
        "contacts.source_external_id == lead.id (within org)",
        "contacts.phone_normalized == normalized(lead phone) AND contacts.source='meta_lead_ads' (within org)",
      ],
      guarantee:
        "Leads already represented by either strategy are excluded from `would_import`; mode=apply only dispatches the remaining set.",
    },
    forms: formReports,
  });
});
