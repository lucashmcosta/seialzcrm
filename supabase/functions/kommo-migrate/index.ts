import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Phase = "users"|"pipelines"|"custom_fields"|"companies"|"contacts"|"leads"|"tasks"|"notes_contacts"|"notes_leads"|"events"|"done";

interface CursorState {
  phase: Phase;
  contacts_page: number; leads_page: number; companies_page: number;
  tasks_page: number; notes_contacts_page: number; notes_leads_page: number;
  events_page: number; custom_fields_step: number;
  contacts_complete: boolean; leads_complete: boolean; companies_complete: boolean;
  tasks_complete: boolean; notes_contacts_complete: boolean; notes_leads_complete: boolean;
  events_complete: boolean; users_complete: boolean; pipelines_complete: boolean;
  custom_fields_complete: boolean;
  kommo_contact_id_map: Record<string, string>;
  kommo_company_id_map: Record<string, string>;
  kommo_user_id_map: Record<string, string>;
  default_user_id: string;
}

interface ImportConfig {
  stage_mapping?: Record<string, string>; duplicate_mode?: string;
  import_orphan_contacts?: boolean; subdomain?: string; access_token?: string;
  user_mapping?: Record<string, string>;
  selected_pipeline_ids?: number[];
  import_companies?: boolean; import_tasks?: boolean; import_notes?: boolean;
  import_events?: boolean; import_custom_fields?: boolean;
}

const PS = 250;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function apiFetch(url: string, opts: RequestInit, retries = 5): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(url, opts);
    if (r.ok || r.status === 204) return r;
    if (r.status === 429) { await delay(Math.pow(2, i) * 1000); continue; }
    throw new Error(`HTTP ${r.status}`);
  }
  throw new Error("Max retries");
}

function normPhone(p: string | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length >= 10 && d.length <= 15) return d.startsWith("55") ? `+${d}` : `+55${d}`;
  return null;
}

const PHASES: Phase[] = ["users","pipelines","custom_fields","companies","contacts","leads","tasks","notes_contacts","notes_leads","events"];

function nextPhase(cur: Phase, cfg: ImportConfig): Phase {
  const idx = PHASES.indexOf(cur);
  for (let i = idx + 1; i < PHASES.length; i++) {
    const n = PHASES[i];
    if (n === "companies" && !cfg.import_companies) continue;
    if (n === "tasks" && !cfg.import_tasks) continue;
    if ((n === "notes_contacts" || n === "notes_leads") && !cfg.import_notes) continue;
    if (n === "events" && !cfg.import_events) continue;
    if (n === "custom_fields" && !cfg.import_custom_fields) continue;
    return n;
  }
  return "done";
}

function defaultCursor(): CursorState {
  return {
    phase: "users", contacts_page: 1, leads_page: 1, companies_page: 1,
    tasks_page: 1, notes_contacts_page: 1, notes_leads_page: 1, events_page: 1,
    custom_fields_step: 0, contacts_complete: false, leads_complete: false,
    companies_complete: false, tasks_complete: false, notes_contacts_complete: false,
    notes_leads_complete: false, events_complete: false, users_complete: false,
    pipelines_complete: false, custom_fields_complete: false,
    kommo_contact_id_map: {}, kommo_company_id_map: {}, kommo_user_id_map: {},
    default_user_id: "",
  };
}

// Helper: upsert check
async function findExisting(sb: any, table: string, orgId: string, srcExtId: string) {
  const { data } = await sb.from(table).select("id").eq("organization_id", orgId)
    .eq("source_external_id", srcExtId).is("deleted_at", null).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { import_log_id, ...body } = await req.json();
    if (!import_log_id) throw new Error("import_log_id required");

    const { data: log, error: le } = await sb.from("import_logs").select("*").eq("id", import_log_id).single();
    if (le || !log) throw new Error("Import log not found");

    const l = log as any;

    if (l.status === "pending") {
      const cfg: ImportConfig = {
        subdomain: body.subdomain || l.config?.subdomain,
        access_token: body.access_token || l.config?.access_token,
        stage_mapping: body.stage_mapping || l.config?.stage_mapping,
        duplicate_mode: body.duplicate_mode || l.config?.duplicate_mode || "skip",
        import_orphan_contacts: body.import_orphan_contacts ?? l.config?.import_orphan_contacts ?? true,
        user_mapping: body.user_mapping || l.config?.user_mapping || {},
        import_companies: body.import_companies ?? l.config?.import_companies ?? false,
        import_tasks: body.import_tasks ?? l.config?.import_tasks ?? false,
        import_notes: body.import_notes ?? l.config?.import_notes ?? false,
        import_events: body.import_events ?? l.config?.import_events ?? false,
        import_custom_fields: body.import_custom_fields ?? l.config?.import_custom_fields ?? false,
      };
      // Bug fix #2: limpar erros de execuções anteriores ao iniciar nova migração
      await sb.from("import_logs").update({ status: "running", started_at: new Date().toISOString(), config: cfg, cursor_state: defaultCursor(), errors: [], error_count: 0 }).eq("id", import_log_id);
      l.config = cfg; l.status = "running"; l.cursor_state = defaultCursor(); l.errors = [];
    }

    const cfg = l.config as ImportConfig;
    const orgId = l.organization_id;
    if (!cfg.subdomain || !cfg.access_token) throw new Error("Missing credentials");

    // Sanitize subdomain: remove protocol and .kommo.com suffix
    const sanitizedSubdomain = cfg.subdomain
      .replace(/^https?:\/\//i, '')
      .replace(/\.kommo\.com.*$/i, '')
      .replace(/[\/\s]/g, '')
      .trim();

    const base = `https://${sanitizedSubdomain}.kommo.com/api/v4`;
    const hd = { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" };
    const dupMode = cfg.duplicate_mode || "skip";

    let c: CursorState = l.cursor_state || defaultCursor();
    const errs: any[] = l.status === "running" && l.errors?.length ? [...l.errors] : [];

    // Counters
    let ic = l.imported_contacts || 0, sc = l.skipped_contacts || 0;
    let io = l.imported_opportunities || 0, so = l.skipped_opportunities || 0;
    let iCo = l.imported_companies || 0, iT = l.imported_tasks || 0;
    let iN = l.imported_notes || 0, iE = l.imported_events || 0, iCf = l.imported_custom_fields || 0;
    let tc = l.total_contacts || 0, to2 = l.total_opportunities || 0;
    let tCo = l.total_companies || 0, tT = l.total_tasks || 0;
    let tN = l.total_notes || 0, tE = l.total_events || 0, tCf = l.total_custom_fields || 0;
    let cIds = [...(l.imported_contact_ids || [])];
    let oIds = [...(l.imported_opportunity_ids || [])];
    let coIds = [...(l.imported_company_ids || [])];
    let tIds = [...(l.imported_task_ids || [])];
    let aIds = [...(l.imported_activity_ids || [])];

    const cMap: Record<string, string> = { ...(c.kommo_contact_id_map || {}) };
    const coMap: Record<string, string> = { ...(c.kommo_company_id_map || {}) };
    const uMap: Record<string, string> = { ...(c.kommo_user_id_map || {}) };
    let defUser = c.default_user_id || "";

    // Restore maps if resuming
    if (!Object.keys(cMap).length && cIds.length) {
      const { data: ec } = await sb.from("contacts").select("id, source_external_id").in("id", cIds.slice(0, 500));
      ec?.forEach((x: any) => { if (x.source_external_id) cMap[x.source_external_id.replace("kommo_", "")] = x.id; });
    }

    // Bug fix #3: Rebuild user map from DB if empty (e.g. Users phase failed on previous run)
    if (!Object.keys(uMap).length) {
      const { data: mappings } = await sb.from("kommo_user_mappings").select("kommo_user_id, seialz_user_id").eq("organization_id", orgId).not("seialz_user_id", "is", null);
      mappings?.forEach((m: any) => { uMap[String(m.kommo_user_id)] = m.seialz_user_id; });
      c.kommo_user_id_map = uMap;
    }

    // Ensure defUser is always populated
    if (!defUser) {
      const { data: fallbackOrg } = await sb.from("user_organizations").select("user_id").eq("organization_id", orgId).eq("is_active", true).limit(1).single();
      defUser = fallbackOrg?.user_id || l.created_by_user_id || "";
      c.default_user_id = defUser;
    }

    // Helper: convert Kommo Unix timestamp to ISO string
    function kommoDate(ts: number | undefined | null): string | undefined {
      if (!ts) return undefined;
      return new Date(ts * 1000).toISOString();
    }

    // === USERS ===
    if (c.phase === "users" && !c.users_complete) {
      try {
        const r = await apiFetch(`${base}/users`, { headers: hd });
        if (r.status !== 204) {
          const users = (await r.json())._embedded?.users || [];
          const um = cfg.user_mapping || {};
          const { data: ou } = await sb.from("user_organizations").select("user_id").eq("organization_id", orgId).eq("is_active", true).limit(1);
          defUser = ou?.[0]?.user_id || "";
          for (const u of users) {
            const sid = um[String(u.id)] || null;
            await sb.from("kommo_user_mappings").upsert({ organization_id: orgId, kommo_user_id: u.id, kommo_user_name: u.name, kommo_user_email: u.email, seialz_user_id: sid }, { onConflict: "organization_id,kommo_user_id" });
            if (sid) uMap[String(u.id)] = sid;
          }
        }
      } catch (e: any) { errs.push({ type: "users", error: e.message }); }
      c.users_complete = true; c.default_user_id = defUser; c.kommo_user_id_map = uMap;
      c.phase = nextPhase("users", cfg);
    }

    // === PIPELINES ===
    if (c.phase === "pipelines" && !c.pipelines_complete) {
      c.pipelines_complete = true; c.phase = nextPhase("pipelines", cfg);
    }

    // === CUSTOM FIELDS ===
    if (c.phase === "custom_fields" && !c.custom_fields_complete) {
      const entities = ["contacts", "leads", "companies"];
      const modMap: Record<string, string> = { contacts: "contacts", leads: "opportunities", companies: "companies" };
      const ftMap: Record<string, string> = { text: "text", numeric: "number", textarea: "text", select: "select", multiselect: "multiselect", date: "date", url: "text", checkbox: "checkbox", date_time: "date", birthday: "date", radiobutton: "select", monetary: "number" };
      const step = c.custom_fields_step || 0;
      if (step < entities.length) {
        const et = entities[step];
        try {
          const r = await apiFetch(`${base}/${et}/custom_fields`, { headers: hd });
          if (r.status !== 204) {
            const fields = (await r.json())._embedded?.custom_fields || [];
            for (const f of fields) {
              if (f.code) continue;
              const sei = `kommo_field_${f.id}`;
              const ft = ftMap[f.type] || "text";
              const opts = f.enums ? { options: f.enums.map((e: any) => ({ value: String(e.value), label: e.value })) } : null;
              const { data: ex } = await sb.from("custom_field_definitions").select("id").eq("organization_id", orgId).eq("source_external_id", sei).maybeSingle();
              if (ex) { if (dupMode === "update") await sb.from("custom_field_definitions").update({ label: f.name, field_type: ft, options: opts }).eq("id", ex.id); }
              else { const { error: ie } = await sb.from("custom_field_definitions").insert({ organization_id: orgId, module: modMap[et], name: f.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: f.name, field_type: ft, options: opts, source_external_id: sei, order_index: f.sort || 0 }); if (!ie) iCf++; }
            }
            tCf += fields.length;
          }
        } catch (e: any) { errs.push({ type: "custom_fields", entity: et, error: e.message }); }
        c.custom_fields_step = step + 1;
        if (c.custom_fields_step >= entities.length) { c.custom_fields_complete = true; c.phase = nextPhase("custom_fields", cfg); }
      }
    }

    // === COMPANIES ===
    if (c.phase === "companies" && !c.companies_complete) {
      const r = await apiFetch(`${base}/companies?limit=${PS}&page=${c.companies_page}`, { headers: hd });
      if (r.status === 204 || !(await r.clone().text()).includes("_embedded")) {
        c.companies_complete = true; c.phase = nextPhase("companies", cfg);
      } else {
        const items = (await r.json())._embedded?.companies || [];
        if (!items.length) { c.companies_complete = true; c.phase = nextPhase("companies", cfg); }
        else {
          const ps = (c.companies_page - 1) * PS + items.length;
          tCo = items.length === PS ? Math.max(tCo, ps + PS) : ps;
          for (const co of items) {
            try {
              const sei = `kommo_${co.id}`;
              const ph = co.custom_fields_values?.find((f: any) => f.field_code === "PHONE")?.values?.[0]?.value;
              const ex = await findExisting(sb, "companies", orgId, sei);
              if (ex) {
                if (dupMode === "update") { await sb.from("companies").update({ name: co.name, phone: ph || undefined, updated_at: kommoDate(co.updated_at) }).eq("id", ex.id); iCo++; coIds.push(ex.id); }
                coMap[String(co.id)] = ex.id;
              } else {
                const { data: n, error: ie } = await sb.from("companies").insert({ organization_id: orgId, name: co.name || "Empresa sem nome", phone: ph || null, source: "kommo", source_external_id: sei, created_at: kommoDate(co.created_at), updated_at: kommoDate(co.updated_at) }).select("id").single();
                if (!ie && n) { iCo++; coIds.push(n.id); coMap[String(co.id)] = n.id; }
                else if (ie) errs.push({ type: "company", kommo_id: co.id, error: ie.message });
              }
            } catch (e: any) { errs.push({ type: "company", kommo_id: co.id, error: e.message }); }
          }
          if (items.length < PS) { c.companies_complete = true; c.phase = nextPhase("companies", cfg); }
          else c.companies_page++;
        }
      }
      c.kommo_company_id_map = coMap;
    }

    // === CONTACTS ===
    if (c.phase === "contacts" && !c.contacts_complete) {
      const r = await apiFetch(`${base}/contacts?limit=${PS}&page=${c.contacts_page}&with=leads,companies`, { headers: hd });
      if (r.status === 204) { c.contacts_complete = true; c.phase = nextPhase("contacts", cfg); }
      else {
        const items = (await r.json())._embedded?.contacts || [];
        const ps = (c.contacts_page - 1) * PS + items.length;
        tc = items.length === PS ? Math.max(tc, ps + PS) : ps;
        if (!items.length) { c.contacts_complete = true; c.phase = nextPhase("contacts", cfg); }
        else {
          for (const ct of items) {
            try {
              const email = ct.custom_fields_values?.find((f: any) => f.field_code === "EMAIL")?.values?.[0]?.value?.toLowerCase();
              const phone = normPhone(ct.custom_fields_values?.find((f: any) => f.field_code === "PHONE")?.values?.[0]?.value);
              if (!phone) { sc++; continue; }
              let ex = null;
              if (email) { const { data } = await sb.from("contacts").select("id").eq("organization_id", orgId).eq("email", email).is("deleted_at", null).maybeSingle(); ex = data; }
              if (!ex && phone) { const { data } = await sb.from("contacts").select("id").eq("organization_id", orgId).eq("phone", phone).is("deleted_at", null).maybeSingle(); ex = data; }
              let compId: string | null = null;
              const lc = ct._embedded?.companies?.[0];
              if (lc) compId = coMap[String(lc.id)] || null;
              const owner = ct.responsible_user_id ? (uMap[String(ct.responsible_user_id)] || defUser) : defUser;
              if (ex) {
                if (dupMode === "skip") { sc++; cMap[String(ct.id)] = ex.id; continue; }
                if (dupMode === "update") { await sb.from("contacts").update({ full_name: ct.name, email, phone, source_external_id: `kommo_${ct.id}`, company_id: compId || undefined, owner_user_id: owner || undefined, updated_at: kommoDate(ct.updated_at) }).eq("id", ex.id); ic++; cIds.push(ex.id); cMap[String(ct.id)] = ex.id; continue; }
              }
              const { data: n, error: ie } = await sb.from("contacts").insert({ organization_id: orgId, full_name: ct.name || "Sem nome", email, phone, source: "kommo", source_external_id: `kommo_${ct.id}`, company_id: compId, owner_user_id: owner || null, created_at: kommoDate(ct.created_at), updated_at: kommoDate(ct.updated_at) }).select("id").single();
              if (ie) errs.push({ type: "contact", kommo_id: ct.id, error: ie.message });
              else { ic++; cIds.push(n.id); cMap[String(ct.id)] = n.id; }
            } catch (e: any) { errs.push({ type: "contact", kommo_id: ct.id, error: e.message }); }
          }
          if (items.length < PS) { c.contacts_complete = true; c.phase = nextPhase("contacts", cfg); }
          else c.contacts_page++;
        }
      }
      c.kommo_contact_id_map = cMap;
    }

    // === LEADS ===
    if (c.phase === "leads" && !c.leads_complete) {
      const r = await apiFetch(`${base}/leads?limit=${PS}&page=${c.leads_page}&with=contacts`, { headers: hd });
      if (r.status === 204) { c.leads_complete = true; c.phase = nextPhase("leads", cfg); }
      else {
        const items = (await r.json())._embedded?.leads || [];
        if (c.leads_page === 1) to2 = items.length * 10;
        if (!items.length) { c.leads_complete = true; c.phase = nextPhase("leads", cfg); }
        else {
          for (const ld of items) {
            try {
              let contactId: string | null = null;
              for (const lc of (ld._embedded?.contacts || [])) {
                if (cMap[String(lc.id)]) { contactId = cMap[String(lc.id)]; break; }
              }
              if (!contactId) {
                for (const lc of (ld._embedded?.contacts || [])) {
                  const { data: ec } = await sb.from("contacts").select("id").eq("organization_id", orgId).eq("source_external_id", `kommo_${lc.id}`).is("deleted_at", null).maybeSingle();
                  if (ec) { contactId = ec.id; cMap[String(lc.id)] = ec.id; break; }
                }
              }
              if (!contactId) { so++; continue; }
              // Skip leads from unselected pipelines
              const selectedPipelines = cfg.selected_pipeline_ids;
              if (selectedPipelines && selectedPipelines.length > 0 && !selectedPipelines.includes(ld.pipeline_id)) { so++; continue; }
              const sk = `${ld.pipeline_id}_${ld.status_id}`;
              const stageId = cfg.stage_mapping?.[sk];
              if (!stageId) { so++; continue; }
              const owner = ld.responsible_user_id ? (uMap[String(ld.responsible_user_id)] || defUser) : defUser;
              const ex = await findExisting(sb, "opportunities", orgId, `kommo_${ld.id}`);
              if (ex) {
                if (dupMode === "skip") { so++; continue; }
                if (dupMode === "update") { await sb.from("opportunities").update({ title: ld.name, amount: ld.price || 0, pipeline_stage_id: stageId, contact_id: contactId, owner_user_id: owner || undefined, updated_at: kommoDate(ld.updated_at) }).eq("id", ex.id); io++; oIds.push(ex.id); continue; }
              }
              const { data: n, error: oe } = await sb.from("opportunities").insert({ organization_id: orgId, contact_id: contactId, title: ld.name || "Lead sem título", amount: ld.price || 0, pipeline_stage_id: stageId, source: "kommo", source_external_id: `kommo_${ld.id}`, owner_user_id: owner || null, created_at: kommoDate(ld.created_at), updated_at: kommoDate(ld.updated_at) }).select("id").single();
              if (oe) errs.push({ type: "opportunity", kommo_id: ld.id, error: oe.message });
              else { io++; oIds.push(n.id); }
            } catch (e: any) { errs.push({ type: "opportunity", kommo_id: ld.id, error: e.message }); }
          }
          if (items.length < PS) { c.leads_complete = true; c.phase = nextPhase("leads", cfg); }
          else c.leads_page++;
        }
      }
      c.kommo_contact_id_map = cMap;
    }

    // === TASKS ===
    if (c.phase === "tasks" && !c.tasks_complete) {
      const r = await apiFetch(`${base}/tasks?limit=${PS}&page=${c.tasks_page}`, { headers: hd });
      if (r.status === 204) { c.tasks_complete = true; c.phase = nextPhase("tasks", cfg); }
      else {
        const items = (await r.json())._embedded?.tasks || [];
        if (!items.length) { c.tasks_complete = true; c.phase = nextPhase("tasks", cfg); }
        else {
          const ps = (c.tasks_page - 1) * PS + items.length;
          tT = items.length === PS ? Math.max(tT, ps + PS) : ps;
          for (const tk of items) {
            try {
              const sei = `kommo_task_${tk.id}`;
              const ex = await findExisting(sb, "tasks", orgId, sei);
              if (ex) { if (dupMode === "skip") continue; if (dupMode === "update") { await sb.from("tasks").update({ title: tk.text || "Tarefa Kommo", status: tk.is_completed ? "completed" : "pending" }).eq("id", ex.id); iT++; tIds.push(ex.id); continue; } }
              let ctId: string | null = null, opId: string | null = null;
              if (tk.entity_type === "contacts" && tk.entity_id) ctId = cMap[String(tk.entity_id)] || null;
              else if (tk.entity_type === "leads" && tk.entity_id) { const { data: o } = await sb.from("opportunities").select("id").eq("organization_id", orgId).eq("source_external_id", `kommo_${tk.entity_id}`).is("deleted_at", null).maybeSingle(); opId = o?.id || null; }
              // Bug fix #1: fallback robusto — se defUser vazio, buscar primeiro usuário ativo da org
              let auid = tk.responsible_user_id ? (uMap[String(tk.responsible_user_id)] || defUser) : defUser;
              if (!auid) {
                const { data: fallbackUser } = await sb.from("user_organizations").select("user_id").eq("organization_id", orgId).eq("is_active", true).limit(1).single();
                if (fallbackUser) { defUser = fallbackUser.user_id; auid = defUser; c.default_user_id = defUser; }
              }
              if (!auid) {
                // Último recurso: usar created_by_user_id do log de importação
                if (l.created_by_user_id) { defUser = l.created_by_user_id; auid = defUser; c.default_user_id = defUser; }
                else { errs.push({ type: "task", kommo_id: tk.id, error: "Nenhum usuário disponível na organização" }); continue; }
              }
              const due = tk.complete_till ? new Date(tk.complete_till * 1000).toISOString() : null;
              const { data: n, error: ie } = await sb.from("tasks").insert({ organization_id: orgId, title: tk.text || "Tarefa Kommo", description: `Importado da Kommo (ID: ${tk.id})`, status: tk.is_completed ? "completed" : "pending", due_at: due, contact_id: ctId, opportunity_id: opId, assigned_user_id: auid, created_by_user_id: auid, source_external_id: sei }).select("id").single();
              if (!ie && n) { iT++; tIds.push(n.id); } else if (ie) errs.push({ type: "task", kommo_id: tk.id, error: ie.message });
            } catch (e: any) { errs.push({ type: "task", kommo_id: tk.id, error: e.message }); }
          }
          if (items.length < PS) { c.tasks_complete = true; c.phase = nextPhase("tasks", cfg); }
          else c.tasks_page++;
        }
      }
    }

    // === NOTES helper ===
    async function processNotes(endpoint: string, pageKey: "notes_contacts_page"|"notes_leads_page", completeKey: "notes_contacts_complete"|"notes_leads_complete", isLead: boolean) {
      const r = await apiFetch(`${base}/${endpoint}?limit=${PS}&page=${c[pageKey]}`, { headers: hd });
      if (r.status === 204) { c[completeKey] = true; c.phase = nextPhase(isLead ? "notes_leads" : "notes_contacts", cfg); return; }
      const notes = (await r.json())._embedded?.notes || [];
      if (!notes.length) { c[completeKey] = true; c.phase = nextPhase(isLead ? "notes_leads" : "notes_contacts", cfg); return; }
      if (!isLead) { const ps = (c[pageKey] - 1) * PS + notes.length; tN = notes.length === PS ? Math.max(tN, ps + PS) : Math.max(tN, ps); }
      for (const n of notes) {
        try {
          const sei = `kommo_note_${n.id}`;
          const { data: ex } = await sb.from("activities").select("id").eq("organization_id", orgId).eq("source_external_id", sei).is("deleted_at", null).maybeSingle();
          if (ex && dupMode === "skip") continue;
          let ctId: string | null = null, opId: string | null = null;
          if (isLead && n.entity_id) { const { data: o } = await sb.from("opportunities").select("id").eq("organization_id", orgId).eq("source_external_id", `kommo_${n.entity_id}`).is("deleted_at", null).maybeSingle(); opId = o?.id || null; }
          else ctId = cMap[String(n.entity_id)] || null;
          const cby = n.created_by ? (uMap[String(n.created_by)] || null) : null;
          let at = "note"; if (n.note_type === "call_in" || n.note_type === "call_out") at = "call";
          let mUrl: string | null = null, mSt = "none";
          if (n.params?.file_name || n.params?.link) { mUrl = n.params?.link || null; mSt = mUrl ? "pending" : "none"; }
          const { data: na, error: ie } = await sb.from("activities").insert({ organization_id: orgId, contact_id: ctId, opportunity_id: opId, activity_type: at, title: n.note_type === "common" ? "Nota" : `Nota (${n.note_type})`, body: n.params?.text || n.text || "", source_external_id: sei, created_by_user_id: cby, occurred_at: n.created_at ? new Date(n.created_at * 1000).toISOString() : new Date().toISOString(), media_source_url: mUrl, media_status: mSt }).select("id").single();
          if (!ie && na) { iN++; aIds.push(na.id); } else if (ie) errs.push({ type: isLead ? "note_lead" : "note_contact", kommo_id: n.id, error: ie.message });
        } catch (e: any) { errs.push({ type: isLead ? "note_lead" : "note_contact", kommo_id: n.id, error: e.message }); }
      }
      if (notes.length < PS) { c[completeKey] = true; c.phase = nextPhase(isLead ? "notes_leads" : "notes_contacts", cfg); }
      else c[pageKey]++;
    }

    if (c.phase === "notes_contacts" && !c.notes_contacts_complete) await processNotes("contacts/notes", "notes_contacts_page", "notes_contacts_complete", false);
    if (c.phase === "notes_leads" && !c.notes_leads_complete) await processNotes("leads/notes", "notes_leads_page", "notes_leads_complete", true);

    // === EVENTS ===
    if (c.phase === "events" && !c.events_complete) {
      const r = await apiFetch(`${base}/events?limit=${PS}&page=${c.events_page}&filter[type]=lead_status_changed,entity_linked`, { headers: hd });
      if (r.status === 204) { c.events_complete = true; c.phase = "done"; }
      else {
        const items = (await r.json())._embedded?.events || [];
        if (!items.length) { c.events_complete = true; c.phase = "done"; }
        else {
          const ps = (c.events_page - 1) * PS + items.length;
          tE = items.length === PS ? Math.max(tE, ps + PS) : ps;
          for (const ev of items) {
            try {
              const sei = `kommo_event_${ev.id}`;
              const { data: ex } = await sb.from("activities").select("id").eq("organization_id", orgId).eq("source_external_id", sei).is("deleted_at", null).maybeSingle();
              if (ex) continue;
              let ctId: string | null = null, opId: string | null = null;
              if (ev.entity_type === "contact" && ev.entity_id) ctId = cMap[String(ev.entity_id)] || null;
              else if (ev.entity_type === "lead" && ev.entity_id) { const { data: o } = await sb.from("opportunities").select("id").eq("organization_id", orgId).eq("source_external_id", `kommo_${ev.entity_id}`).is("deleted_at", null).maybeSingle(); opId = o?.id || null; }
              const cby = ev.created_by ? (uMap[String(ev.created_by)] || null) : null;
              const { data: na, error: ie } = await sb.from("activities").insert({ organization_id: orgId, contact_id: ctId, opportunity_id: opId, activity_type: "pipeline_stage_change", title: `Evento: ${ev.type}`, body: JSON.stringify(ev.value_after || ev.value_before || {}), source_external_id: sei, created_by_user_id: cby, occurred_at: ev.created_at ? new Date(ev.created_at * 1000).toISOString() : new Date().toISOString() }).select("id").single();
              if (!ie && na) { iE++; aIds.push(na.id); }
            } catch (e: any) { errs.push({ type: "event", kommo_id: ev.id, error: e.message }); }
          }
          if (items.length < PS) { c.events_complete = true; c.phase = "done"; }
          else c.events_page++;
        }
      }
    }

    // === PROGRESS ===
    let pct = c.phase === "done" ? 100 : Math.min(Math.round((PHASES.indexOf(c.phase) / PHASES.length) * 100), 99);
    const tot = ic + sc + io + so + iCo + iT + iN + iE;
    const errRate = tot > 0 ? (errs.length / tot) * 100 : 0;
    const pause = errRate > 20 && tot > 50;
    let status = c.phase === "done" ? "completed" : pause ? "paused" : "running";

    await sb.from("import_logs").update({
      status, cursor_state: c, total_contacts: tc, imported_contacts: ic, skipped_contacts: sc,
      total_opportunities: to2, imported_opportunities: io, skipped_opportunities: so,
      total_companies: tCo, imported_companies: iCo, total_tasks: tT, imported_tasks: iT,
      total_notes: tN, imported_notes: iN, total_events: tE, imported_events: iE,
      total_custom_fields: tCf, imported_custom_fields: iCf, progress_percent: pct,
      imported_contact_ids: cIds, imported_opportunity_ids: oIds, imported_company_ids: coIds,
      imported_task_ids: tIds, imported_activity_ids: aIds, errors: errs, error_count: errs.length,
      rollback_available: c.phase === "done", completed_at: c.phase === "done" ? new Date().toISOString() : null,
    }).eq("id", import_log_id);

    return new Response(JSON.stringify({
      success: true, continue: c.phase !== "done" && !pause, phase: c.phase, progress: pct,
      imported_contacts: ic, imported_opportunities: io, imported_companies: iCo,
      imported_tasks: iT, imported_notes: iN, imported_events: iE, status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Kommo migration error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
