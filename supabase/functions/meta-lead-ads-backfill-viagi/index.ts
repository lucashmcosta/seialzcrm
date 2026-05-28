// One-shot backfill for Viagi historical Meta Lead Ads (CSV in viagi_csv_staging_2026_05_28).
// Modes:
//   { mode: "dry_run" }  -> classifies and returns counts + samples. No writes.
//   { mode: "apply", confirm_token: "VIAGI_2026_05_28" } -> performs writes.
// Disposable: delete this function + staging table after apply succeeds.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ORG_ID = 'b246ef6f-6242-4011-a112-6d8783d2896a';
const LEAD_STAGE_ID = 'b4f5fce5-cefa-4770-a928-298b72c22562'; // "Novo"
const OWNER_USER_ID = '95697f6c-0b0e-4b04-95ac-118d140d3c1b'; // Ketlyn Vieira
const CONFIRM_TOKEN = 'VIAGI_2026_05_28';

async function fireCapiLead(contactId: string): Promise<{ ok: boolean; err?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-capi-send-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ organization_id: ORG_ID, event_name: 'Lead', contact_id: contactId }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, err: `HTTP ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 200) };
  }
}

type CsvRow = {
  lead_id: string;
  created_time: string | null;
  ad_id: string | null;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  form_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  problema: string | null;
};

type ContactRow = {
  id: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  source_external_id: string | null;
  marketing_campaign_id: string | null;
  attribution_path: string[] | null;
};

type MarketingCampaign = { id: string; ad_id: string; ad_name: string | null; campaign_name: string | null };

function normalizePhone(s: string | null | undefined): string {
  return (s || '').replace(/\D/g, '');
}
function normalizeEmail(s: string | null | undefined): string | null {
  const t = (s || '').trim().toLowerCase();
  return t || null;
}
function last11(s: string): string {
  return s.length >= 11 ? s.slice(-11) : s;
}
function appendPath(existing: string[] | null, token: string): string[] {
  const arr = existing && Array.isArray(existing) ? [...existing] : [];
  if (arr.length === 0 || arr[arr.length - 1] !== token) arr.push(token);
  return arr;
}
function buildFullName(nome: string | null, telefone: string | null): string {
  const n = (nome || '').trim();
  if (n) return n;
  const p = (telefone || '').trim();
  return p || 'Lead Meta';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any = {};
  try { body = await req.json(); } catch { /* ok */ }

  const mode: 'dry_run' | 'apply' = body?.mode === 'apply' ? 'apply' : 'dry_run';
  if (mode === 'apply' && body?.confirm_token !== CONFIRM_TOKEN) {
    return new Response(JSON.stringify({ error: `apply mode requires confirm_token="${CONFIRM_TOKEN}"` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 1. Load CSV staging (paginate; default Supabase cap is 1000)
  const csv: CsvRow[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('viagi_csv_staging_2026_05_28')
        .select('lead_id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,nome,email,telefone,problema')
        .range(from, from + PAGE - 1);
      if (error) return jsonErr(error.message);
      if (!data || data.length === 0) break;
      // Strip "p:" prefix left over from the CSV loader
      for (const r of data as CsvRow[]) {
        if (r.telefone && r.telefone.startsWith('p:')) r.telefone = r.telefone.slice(2);
      }
      csv.push(...(data as CsvRow[]));
      if (data.length < PAGE) break;
    }
  }

  // 2. Load ad_id -> marketing_campaign mapping
  const adIds = Array.from(new Set(csv.map((r) => r.ad_id).filter(Boolean))) as string[];
  const { data: mcRows, error: mcErr } = await supabase
    .from('marketing_campaigns')
    .select('id,ad_id,ad_name,campaign_name')
    .eq('organization_id', ORG_ID)
    .in('ad_id', adIds);
  if (mcErr) return jsonErr(mcErr.message);
  const mcByAd = new Map<string, MarketingCampaign>();
  for (const m of (mcRows || []) as MarketingCampaign[]) mcByAd.set(m.ad_id, m);

  // 3. Load all live contacts for the org (only needed columns) — there are ~2487
  const allContacts: ContactRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id,phone,email,source,source_external_id,marketing_campaign_id,attribution_path')
      .eq('organization_id', ORG_ID)
      .is('deleted_at', null)
      .range(from, from + PAGE - 1);
    if (error) return jsonErr(error.message);
    if (!data || data.length === 0) break;
    allContacts.push(...(data as ContactRow[]));
    if (data.length < PAGE) break;
  }

  // 4. Build phone/email indexes
  const byPhone11 = new Map<string, ContactRow>();
  const byEmail = new Map<string, ContactRow>();
  for (const c of allContacts) {
    const p = normalizePhone(c.phone);
    if (p.length >= 10) {
      const key = last11(p);
      if (!byPhone11.has(key)) byPhone11.set(key, c);
    }
    const e = normalizeEmail(c.email);
    if (e && !byEmail.has(e)) byEmail.set(e, c);
  }

  // 5. Classify
  type Plan =
    | { branch: 'A'; row: CsvRow }
    | { branch: 'B'; row: CsvRow; contact: ContactRow; via: 'phone' | 'email' }
    | { branch: 'C'; row: CsvRow; contact: ContactRow }
    | { branch: 'D'; row: CsvRow; contact: ContactRow; existing_external_id: string };

  const plans: Plan[] = [];
  const adsNotMapped = new Set<string>();
  for (const row of csv) {
    const phone = normalizePhone(row.telefone);
    const email = normalizeEmail(row.email);
    let match: ContactRow | undefined;
    let via: 'phone' | 'email' | undefined;
    if (phone.length >= 10) { match = byPhone11.get(last11(phone)); if (match) via = 'phone'; }
    if (!match && email) { match = byEmail.get(email); if (match) via = 'email'; }

    if (row.ad_id && !mcByAd.has(row.ad_id)) adsNotMapped.add(row.ad_id);

    if (!match) { plans.push({ branch: 'A', row }); continue; }
    if (match.source_external_id === row.lead_id) { plans.push({ branch: 'C', row, contact: match }); continue; }
    if (match.source_external_id && match.source_external_id !== row.lead_id) {
      plans.push({ branch: 'D', row, contact: match, existing_external_id: match.source_external_id }); continue;
    }
    plans.push({ branch: 'B', row, contact: match, via: via! });
  }

  const totals = {
    csv_leads: csv.length,
    branch_A_missing_contact: plans.filter((p) => p.branch === 'A').length,
    branch_B_attribution_upgrade: plans.filter((p) => p.branch === 'B').length,
    branch_B_via_phone: plans.filter((p) => p.branch === 'B' && (p as any).via === 'phone').length,
    branch_B_via_email: plans.filter((p) => p.branch === 'B' && (p as any).via === 'email').length,
    branch_C_already_attributed: plans.filter((p) => p.branch === 'C').length,
    branch_D_other_external_id: plans.filter((p) => p.branch === 'D').length,
    ads_mapped: mcByAd.size,
    ads_in_csv: adIds.length,
    ads_not_mapped: Array.from(adsNotMapped),
  };

  // 6. Samples
  const sampleB = plans.filter((p) => p.branch === 'B').slice(0, 5).map((p) => {
    const pl = p as Extract<Plan, { branch: 'B' }>;
    const mc = pl.row.ad_id ? mcByAd.get(pl.row.ad_id) : undefined;
    return {
      lead_id: pl.row.lead_id, via: pl.via, contact_id: pl.contact.id,
      before: {
        source: pl.contact.source, source_external_id: pl.contact.source_external_id,
        marketing_campaign_id: pl.contact.marketing_campaign_id,
        attribution_path: pl.contact.attribution_path || [],
      },
      after: {
        source: pl.contact.source, source_external_id: pl.row.lead_id,
        marketing_campaign_id: mc?.id ?? null,
        attribution_path: appendPath(pl.contact.attribution_path, 'meta_lead_ads'),
        ad_referral_source_id: pl.row.ad_id,
        ad_referral_source_type: 'lead_form',
        utm_source: 'facebook', utm_medium: 'paid_social',
        utm_campaign: pl.row.campaign_name || mc?.campaign_name || null,
      },
    };
  });
  const sampleA = plans.filter((p) => p.branch === 'A').slice(0, 5).map((p) => {
    const pl = p as Extract<Plan, { branch: 'A' }>;
    const mc = pl.row.ad_id ? mcByAd.get(pl.row.ad_id) : undefined;
    return {
      lead_id: pl.row.lead_id,
      contact_to_create: {
        full_name: buildFullName(pl.row.nome, pl.row.telefone),
        phone: pl.row.telefone, email: pl.row.email,
        source: 'meta_lead_ads', source_external_id: pl.row.lead_id,
        marketing_campaign_id: mc?.id ?? null,
        attribution_path: ['meta_lead_ads'],
      },
      opportunity_to_create: { pipeline_stage_id: LEAD_STAGE_ID, title: buildFullName(pl.row.nome, pl.row.telefone) },
    };
  });
  const sampleD = plans.filter((p) => p.branch === 'D').slice(0, 5).map((p) => {
    const pl = p as Extract<Plan, { branch: 'D' }>;
    return { lead_id: pl.row.lead_id, contact_id: pl.contact.id, existing_external_id: pl.existing_external_id };
  });

  if (mode === 'dry_run') {
    return jsonOk({ mode, organization_id: ORG_ID, totals, sample_branch_B: sampleB, sample_branch_A: sampleA, sample_branch_D: sampleD });
  }

  // 7. APPLY
  const applied = {
    B_updated: 0, A_contacts_created: 0, A_opps_created: 0, D_skipped: sampleD.length,
    capi_sent: 0, capi_failed: 0, capi_errors_sample: [] as any[],
    errors: [] as any[],
  };

  // Branch B: per-row UPDATE (safety: only if source_external_id still null)
  for (const p of plans) {
    if (p.branch !== 'B') continue;
    const pl = p as Extract<Plan, { branch: 'B' }>;
    const mc = pl.row.ad_id ? mcByAd.get(pl.row.ad_id) : undefined;
    const newPath = appendPath(pl.contact.attribution_path, 'meta_lead_ads');
    const update: any = {
      source_external_id: pl.row.lead_id,
      marketing_campaign_id: mc?.id ?? null,
      attribution_path: newPath,
      ad_referral_source_id: pl.row.ad_id,
      ad_referral_source_type: 'lead_form',
      ad_referral_captured_at: pl.row.created_time,
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: pl.row.campaign_name || mc?.campaign_name || null,
    };
    const { error } = await supabase
      .from('contacts')
      .update(update)
      .eq('id', pl.contact.id)
      .is('source_external_id', null);
    if (error) { applied.errors.push({ branch: 'B', lead_id: pl.row.lead_id, error: error.message }); continue; }
    applied.B_updated++;

    // CAPI best-effort
    const capi = await fireCapiLead(pl.contact.id);
    if (capi.ok) applied.capi_sent++;
    else {
      applied.capi_failed++;
      if (applied.capi_errors_sample.length < 5) applied.capi_errors_sample.push({ branch: 'B', lead_id: pl.row.lead_id, error: capi.err });
    }
  }

  // Branch A: insert contact + opportunity (idempotent via source_external_id)
  for (const p of plans) {
    if (p.branch !== 'A') continue;
    const pl = p as Extract<Plan, { branch: 'A' }>;
    const mc = pl.row.ad_id ? mcByAd.get(pl.row.ad_id) : undefined;
    const fullName = buildFullName(pl.row.nome, pl.row.telefone);

    const { data: existing, error: exErr } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', ORG_ID)
      .eq('source_external_id', pl.row.lead_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) { applied.errors.push({ branch: 'A', lead_id: pl.row.lead_id, error: exErr.message }); continue; }

    let contactId = existing?.id;
    let createdNow = false;
    if (!contactId) {
      const { data: ins, error: insErr } = await supabase
        .from('contacts')
        .insert({
          organization_id: ORG_ID,
          owner_user_id: OWNER_USER_ID,
          full_name: fullName,
          phone: pl.row.telefone,
          email: pl.row.email,
          source: 'meta_lead_ads',
          source_external_id: pl.row.lead_id,
          marketing_campaign_id: mc?.id ?? null,
          attribution_path: ['meta_lead_ads'],
          ad_referral_source_id: pl.row.ad_id,
          ad_referral_source_type: 'lead_form',
          ad_referral_captured_at: pl.row.created_time,
          utm_source: 'facebook',
          utm_medium: 'paid_social',
          utm_campaign: pl.row.campaign_name || mc?.campaign_name || null,
          created_at: pl.row.created_time || undefined,
        })
        .select('id')
        .single();
      if (insErr) { applied.errors.push({ branch: 'A', lead_id: pl.row.lead_id, error: insErr.message }); continue; }
      contactId = ins!.id;
      applied.A_contacts_created++;
      createdNow = true;
    }

    const { data: existingOpp, error: opChkErr } = await supabase
      .from('opportunities')
      .select('id')
      .eq('organization_id', ORG_ID)
      .eq('source_external_id', pl.row.lead_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (opChkErr) { applied.errors.push({ branch: 'A_opp_check', lead_id: pl.row.lead_id, error: opChkErr.message }); continue; }
    if (!existingOpp?.id) {
      const { error: opInsErr } = await supabase
        .from('opportunities')
        .insert({
          organization_id: ORG_ID,
          contact_id: contactId,
          owner_user_id: OWNER_USER_ID,
          title: fullName,
          pipeline_stage_id: LEAD_STAGE_ID,
          status: 'open',
          source: 'meta_lead_ads',
          source_external_id: pl.row.lead_id,
          marketing_campaign_id: mc?.id ?? null,
          utm_source: 'facebook',
          utm_medium: 'paid_social',
          utm_campaign: pl.row.campaign_name || mc?.campaign_name || null,
          created_at: pl.row.created_time || undefined,
        });
      if (opInsErr) { applied.errors.push({ branch: 'A_opp', lead_id: pl.row.lead_id, error: opInsErr.message }); }
      else applied.A_opps_created++;
    }

    // CAPI best-effort (apenas para contatos recém-criados)
    if (createdNow) {
      const capi = await fireCapiLead(contactId!);
      if (capi.ok) applied.capi_sent++;
      else {
        applied.capi_failed++;
        if (applied.capi_errors_sample.length < 5) applied.capi_errors_sample.push({ branch: 'A', lead_id: pl.row.lead_id, error: capi.err });
      }
    }
  }

  return jsonOk({ mode, organization_id: ORG_ID, totals, applied, sample_branch_D: sampleD });
});
});

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function jsonErr(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
