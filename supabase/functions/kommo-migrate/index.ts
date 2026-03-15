import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Phase =
  | "users"
  | "pipelines"
  | "custom_fields"
  | "companies"
  | "contacts"
  | "leads"
  | "tasks"
  | "notes_contacts"
  | "notes_leads"
  | "events"
  | "done";

interface CursorState {
  phase: Phase;
  contacts_page: number;
  leads_page: number;
  companies_page: number;
  tasks_page: number;
  notes_contacts_page: number;
  notes_leads_page: number;
  events_page: number;
  custom_fields_step: number; // 0=contacts, 1=leads, 2=companies
  contacts_complete: boolean;
  leads_complete: boolean;
  companies_complete: boolean;
  tasks_complete: boolean;
  notes_contacts_complete: boolean;
  notes_leads_complete: boolean;
  events_complete: boolean;
  users_complete: boolean;
  pipelines_complete: boolean;
  custom_fields_complete: boolean;
  // Maps stored in cursor for cross-phase use
  kommo_contact_id_map: Record<string, string>; // kommo_id -> crm_id
  kommo_company_id_map: Record<string, string>;
  kommo_user_id_map: Record<string, string>; // kommo_user_id -> seialz_user_id
  default_user_id: string; // fallback for NOT NULL assigned_user_id
}

interface ImportConfig {
  stage_mapping?: Record<string, string>;
  duplicate_mode?: string;
  import_orphan_contacts?: boolean;
  subdomain?: string;
  access_token?: string;
  user_mapping?: Record<string, string>; // kommo_user_id -> seialz_user_id
  import_companies?: boolean;
  import_tasks?: boolean;
  import_notes?: boolean;
  import_events?: boolean;
  import_custom_fields?: boolean;
}

const PAGE_SIZE = 250;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 5): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok || response.status === 204) return response;
    if (response.status === 429) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`Rate limited (429). Retry ${attempt + 1}/${maxRetries} in ${backoffMs}ms`);
      await delay(backoffMs);
      continue;
    }
    lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    break;
  }
  throw lastError || new Error("Max retries exceeded");
}

function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  }
  return null;
}

// Phase order for progress calculation
const PHASE_ORDER: Phase[] = [
  "users", "pipelines", "custom_fields", "companies",
  "contacts", "leads", "tasks",
  "notes_contacts", "notes_leads", "events",
];

function getPhaseIndex(phase: Phase): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx === -1 ? PHASE_ORDER.length : idx;
}

function getNextPhase(current: Phase, config: ImportConfig): Phase {
  const idx = PHASE_ORDER.indexOf(current);
  for (let i = idx + 1; i < PHASE_ORDER.length; i++) {
    const next = PHASE_ORDER[i];
    // Skip disabled phases
    if (next === "companies" && !config.import_companies) continue;
    if (next === "tasks" && !config.import_tasks) continue;
    if ((next === "notes_contacts" || next === "notes_leads") && !config.import_notes) continue;
    if (next === "events" && !config.import_events) continue;
    if (next === "custom_fields" && !config.import_custom_fields) continue;
    return next;
  }
  return "done";
}

function defaultCursor(): CursorState {
  return {
    phase: "users",
    contacts_page: 1,
    leads_page: 1,
    companies_page: 1,
    tasks_page: 1,
    notes_contacts_page: 1,
    notes_leads_page: 1,
    events_page: 1,
    custom_fields_step: 0,
    contacts_complete: false,
    leads_complete: false,
    companies_complete: false,
    tasks_complete: false,
    notes_contacts_complete: false,
    notes_leads_complete: false,
    events_complete: false,
    users_complete: false,
    pipelines_complete: false,
    custom_fields_complete: false,
    kommo_contact_id_map: {},
    kommo_company_id_map: {},
    kommo_user_id_map: {},
    default_user_id: "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { import_log_id } = body;

    if (!import_log_id) throw new Error("import_log_id é obrigatório");

    const { data: importLog, error: logError } = await supabase
      .from("import_logs")
      .select("*")
      .eq("id", import_log_id)
      .single();

    if (logError || !importLog) throw new Error("Import log não encontrado");

    const log = importLog as any;

    // Initialize on first call
    if (log.status === "pending") {
      const config: ImportConfig = {
        subdomain: body.subdomain || log.config?.subdomain,
        access_token: body.access_token || log.config?.access_token,
        stage_mapping: body.stage_mapping || log.config?.stage_mapping,
        duplicate_mode: body.duplicate_mode || log.config?.duplicate_mode || "skip",
        import_orphan_contacts: body.import_orphan_contacts ?? log.config?.import_orphan_contacts ?? true,
        user_mapping: body.user_mapping || log.config?.user_mapping || {},
        import_companies: body.import_companies ?? log.config?.import_companies ?? false,
        import_tasks: body.import_tasks ?? log.config?.import_tasks ?? false,
        import_notes: body.import_notes ?? log.config?.import_notes ?? false,
        import_events: body.import_events ?? log.config?.import_events ?? false,
        import_custom_fields: body.import_custom_fields ?? log.config?.import_custom_fields ?? false,
      };

      await supabase
        .from("import_logs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          config,
          cursor_state: defaultCursor(),
        })
        .eq("id", import_log_id);

      log.config = config;
      log.status = "running";
      log.cursor_state = defaultCursor();
    }

    const cfg = log.config as ImportConfig;
    const orgId = log.organization_id;
    const currentSubdomain = cfg.subdomain;
    const currentToken = cfg.access_token;
    const currentDuplicateMode = cfg.duplicate_mode || "skip";

    if (!currentSubdomain || !currentToken) throw new Error("Credenciais não encontradas");

    const baseUrl = `https://${currentSubdomain}.kommo.com/api/v4`;
    const apiHeaders = { Authorization: `Bearer ${currentToken}`, "Content-Type": "application/json" };

    let cursor: CursorState = log.cursor_state || defaultCursor();
    const errors: any[] = [...(log.errors || [])];

    // Counters
    let importedContacts = log.imported_contacts || 0;
    let skippedContacts = log.skipped_contacts || 0;
    let importedOpportunities = log.imported_opportunities || 0;
    let skippedOpportunities = log.skipped_opportunities || 0;
    let importedCompanies = log.imported_companies || 0;
    let importedTasks = log.imported_tasks || 0;
    let importedNotes = log.imported_notes || 0;
    let importedEvents = log.imported_events || 0;
    let importedCustomFields = log.imported_custom_fields || 0;
    let totalContacts = log.total_contacts || 0;
    let totalOpportunities = log.total_opportunities || 0;
    let totalCompanies = log.total_companies || 0;
    let totalTasks = log.total_tasks || 0;
    let totalNotes = log.total_notes || 0;
    let totalEvents = log.total_events || 0;
    let totalCustomFields = log.total_custom_fields || 0;
    let importedContactIds = [...(log.imported_contact_ids || [])];
    let importedOpportunityIds = [...(log.imported_opportunity_ids || [])];
    let importedCompanyIds = [...(log.imported_company_ids || [])];
    let importedTaskIds = [...(log.imported_task_ids || [])];
    let importedActivityIds = [...(log.imported_activity_ids || [])];

    // Restore maps from cursor
    const kommoContactIdMap: Record<string, string> = { ...(cursor.kommo_contact_id_map || {}) };
    const kommoCompanyIdMap: Record<string, string> = { ...(cursor.kommo_company_id_map || {}) };
    const kommoUserIdMap: Record<string, string> = { ...(cursor.kommo_user_id_map || {}) };
    let defaultUserId = cursor.default_user_id || "";

    // Load existing contact mappings if resuming and map is empty
    if (Object.keys(kommoContactIdMap).length === 0 && importedContactIds.length > 0) {
      const { data: existingContacts } = await supabase
        .from("contacts")
        .select("id, source_external_id")
        .in("id", importedContactIds.slice(0, 500));
      existingContacts?.forEach((c: any) => {
        if (c.source_external_id) {
          const kommoId = c.source_external_id.replace("kommo_", "");
          kommoContactIdMap[kommoId] = c.id;
        }
      });
    }

    // ============ PHASE: USERS ============
    if (cursor.phase === "users" && !cursor.users_complete) {
      console.log("Processing users phase");
      try {
        const usersResp = await fetchWithRetry(`${baseUrl}/users`, { headers: apiHeaders });
        if (usersResp.status !== 204) {
          const usersData = await usersResp.json();
          const users = usersData._embedded?.users || [];
          const userMapping = cfg.user_mapping || {};

          // Get first admin user of the org as fallback for NOT NULL fields
          const { data: orgUsers } = await supabase
            .from("user_organizations")
            .select("user_id")
            .eq("organization_id", orgId)
            .eq("is_active", true)
            .limit(1);

          defaultUserId = orgUsers?.[0]?.user_id || "";

          // Upsert kommo_user_mappings
          for (const user of users) {
            const seialzUserId = userMapping[String(user.id)] || null;

            await supabase
              .from("kommo_user_mappings")
              .upsert({
                organization_id: orgId,
                kommo_user_id: user.id,
                kommo_user_name: user.name,
                kommo_user_email: user.email,
                seialz_user_id: seialzUserId,
              }, { onConflict: "organization_id,kommo_user_id" });

            if (seialzUserId) {
              kommoUserIdMap[String(user.id)] = seialzUserId;
            }
          }
        }
      } catch (err: any) {
        errors.push({ type: "users", error: err.message });
      }

      cursor.users_complete = true;
      cursor.default_user_id = defaultUserId;
      cursor.kommo_user_id_map = kommoUserIdMap;
      cursor.phase = getNextPhase("users", cfg);
    }

    // ============ PHASE: PIPELINES ============
    if (cursor.phase === "pipelines" && !cursor.pipelines_complete) {
      // Pipelines are already mapped in config.stage_mapping — just mark complete
      cursor.pipelines_complete = true;
      cursor.phase = getNextPhase("pipelines", cfg);
    }

    // ============ PHASE: CUSTOM FIELDS ============
    if (cursor.phase === "custom_fields" && !cursor.custom_fields_complete) {
      console.log(`Processing custom fields step ${cursor.custom_fields_step}`);
      const entityTypes = ["contacts", "leads", "companies"];
      const moduleMap: Record<string, string> = { contacts: "contacts", leads: "opportunities", companies: "companies" };
      const fieldTypeMap: Record<string, string> = {
        text: "text", numeric: "number", textarea: "text", select: "select",
        multiselect: "multiselect", date: "date", url: "text", checkbox: "checkbox",
        date_time: "date", birthday: "date", smart_address: "text", legal_entity: "text",
        items: "text", linked_entity: "text", tracking_data: "text",
        radiobutton: "select", streetaddress: "text", monetary: "number",
      };

      const step = cursor.custom_fields_step || 0;
      if (step < entityTypes.length) {
        const entityType = entityTypes[step];
        try {
          const resp = await fetchWithRetry(`${baseUrl}/${entityType}/custom_fields`, { headers: apiHeaders });
          if (resp.status !== 204) {
            const data = await resp.json();
            const fields = data._embedded?.custom_fields || [];

            for (const field of fields) {
              // Skip system fields
              if (field.code) continue; // System fields have a code like EMAIL, PHONE

              const sourceExternalId = `kommo_field_${field.id}`;
              const fieldType = fieldTypeMap[field.type] || "text";
              const options = field.enums
                ? { options: field.enums.map((e: any) => ({ value: String(e.value), label: e.value })) }
                : null;

              // Check if exists
              const { data: existing } = await supabase
                .from("custom_field_definitions")
                .select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", sourceExternalId)
                .maybeSingle();

              if (existing) {
                if (currentDuplicateMode === "update") {
                  await supabase
                    .from("custom_field_definitions")
                    .update({
                      label: field.name,
                      field_type: fieldType,
                      options,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", existing.id);
                }
              } else {
                const { error: insertErr } = await supabase
                  .from("custom_field_definitions")
                  .insert({
                    organization_id: orgId,
                    module: moduleMap[entityType],
                    name: field.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                    label: field.name,
                    field_type: fieldType,
                    options,
                    source_external_id: sourceExternalId,
                    order_index: field.sort || 0,
                  });
                if (!insertErr) importedCustomFields++;
              }
            }
            totalCustomFields += fields.length;
          }
        } catch (err: any) {
          errors.push({ type: "custom_fields", entity: entityType, error: err.message });
        }

        cursor.custom_fields_step = step + 1;
        if (cursor.custom_fields_step >= entityTypes.length) {
          cursor.custom_fields_complete = true;
          cursor.phase = getNextPhase("custom_fields", cfg);
        }
      }
    }

    // ============ PHASE: COMPANIES ============
    if (cursor.phase === "companies" && !cursor.companies_complete) {
      console.log(`Processing companies page ${cursor.companies_page}`);
      const resp = await fetchWithRetry(
        `${baseUrl}/companies?limit=${PAGE_SIZE}&page=${cursor.companies_page}`,
        { headers: apiHeaders }
      );

      if (resp.status === 204) {
        cursor.companies_complete = true;
        cursor.phase = getNextPhase("companies", cfg);
      } else {
        const data = await resp.json();
        const companies = data._embedded?.companies || [];

        if (companies.length === 0) {
          cursor.companies_complete = true;
          cursor.phase = getNextPhase("companies", cfg);
        } else {
          const processedSoFar = (cursor.companies_page - 1) * PAGE_SIZE + companies.length;
          if (companies.length === PAGE_SIZE) {
            totalCompanies = Math.max(totalCompanies, processedSoFar + PAGE_SIZE);
          } else {
            totalCompanies = processedSoFar;
          }

          for (const company of companies) {
            try {
              const sourceExternalId = `kommo_${company.id}`;
              const phone = company.custom_fields_values?.find((f: any) => f.field_code === "PHONE")?.values?.[0]?.value;

              const { data: existing } = await supabase
                .from("companies")
                .select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", sourceExternalId)
                .is("deleted_at", null)
                .maybeSingle();

              if (existing) {
                if (currentDuplicateMode === "update") {
                  await supabase.from("companies").update({
                    name: company.name,
                    phone: phone || undefined,
                    updated_at: new Date().toISOString(),
                  }).eq("id", existing.id);
                  importedCompanies++;
                  importedCompanyIds.push(existing.id);
                }
                kommoCompanyIdMap[String(company.id)] = existing.id;
              } else {
                const { data: newCompany, error: insertErr } = await supabase
                  .from("companies")
                  .insert({
                    organization_id: orgId,
                    name: company.name || "Empresa sem nome",
                    phone: phone || null,
                    source: "kommo",
                    source_external_id: sourceExternalId,
                  })
                  .select("id")
                  .single();

                if (!insertErr && newCompany) {
                  importedCompanies++;
                  importedCompanyIds.push(newCompany.id);
                  kommoCompanyIdMap[String(company.id)] = newCompany.id;
                } else if (insertErr) {
                  errors.push({ type: "company", kommo_id: company.id, error: insertErr.message });
                }
              }
            } catch (err: any) {
              errors.push({ type: "company", kommo_id: company.id, error: err.message });
            }
          }

          if (companies.length < PAGE_SIZE) {
            cursor.companies_complete = true;
            cursor.phase = getNextPhase("companies", cfg);
          } else {
            cursor.companies_page++;
          }
        }
      }
      cursor.kommo_company_id_map = kommoCompanyIdMap;
    }

    // ============ PHASE: CONTACTS ============
    if (cursor.phase === "contacts" && !cursor.contacts_complete) {
      console.log(`Processing contacts page ${cursor.contacts_page}`);

      const contactsResponse = await fetchWithRetry(
        `${baseUrl}/contacts?limit=${PAGE_SIZE}&page=${cursor.contacts_page}&with=leads,companies`,
        { headers: apiHeaders }
      );

      if (contactsResponse.status === 204) {
        cursor.contacts_complete = true;
        cursor.phase = getNextPhase("contacts", cfg);
      } else {
        const contactsData = await contactsResponse.json();
        const contacts = contactsData._embedded?.contacts || [];

        const processedSoFar = (cursor.contacts_page - 1) * PAGE_SIZE + contacts.length;
        if (contacts.length === PAGE_SIZE) {
          totalContacts = Math.max(totalContacts, processedSoFar + PAGE_SIZE);
        } else {
          totalContacts = processedSoFar;
        }

        if (contacts.length === 0) {
          cursor.contacts_complete = true;
          cursor.phase = getNextPhase("contacts", cfg);
        } else {
          for (const contact of contacts) {
            try {
              const email = contact.custom_fields_values?.find(
                (f: any) => f.field_code === "EMAIL"
              )?.values?.[0]?.value?.toLowerCase();
              const phoneRaw = contact.custom_fields_values?.find(
                (f: any) => f.field_code === "PHONE"
              )?.values?.[0]?.value;
              const phone = normalizePhone(phoneRaw);

              if (!phone) {
                skippedContacts++;
                continue;
              }

              // Check for duplicates
              let existingContact = null;
              if (email) {
                const { data } = await supabase
                  .from("contacts").select("id")
                  .eq("organization_id", orgId).eq("email", email)
                  .is("deleted_at", null).maybeSingle();
                existingContact = data;
              }
              if (!existingContact && phone) {
                const { data } = await supabase
                  .from("contacts").select("id")
                  .eq("organization_id", orgId).eq("phone", phone)
                  .is("deleted_at", null).maybeSingle();
                existingContact = data;
              }

              // Resolve company_id
              let companyId: string | null = null;
              const linkedCompany = contact._embedded?.companies?.[0];
              if (linkedCompany) {
                companyId = kommoCompanyIdMap[String(linkedCompany.id)] || null;
              }

              // Resolve owner
              const ownerUserId = contact.responsible_user_id
                ? kommoUserIdMap[String(contact.responsible_user_id)] || null
                : null;

              if (existingContact) {
                if (currentDuplicateMode === "skip") {
                  skippedContacts++;
                  kommoContactIdMap[String(contact.id)] = existingContact.id;
                  continue;
                } else if (currentDuplicateMode === "update") {
                  await supabase.from("contacts").update({
                    full_name: contact.name,
                    email: email || undefined,
                    phone: phone || undefined,
                    source_external_id: `kommo_${contact.id}`,
                    company_id: companyId || undefined,
                    owner_user_id: ownerUserId || undefined,
                    updated_at: new Date().toISOString(),
                  }).eq("id", existingContact.id);
                  importedContacts++;
                  importedContactIds.push(existingContact.id);
                  kommoContactIdMap[String(contact.id)] = existingContact.id;
                  continue;
                }
              }

              const { data: newContact, error: insertError } = await supabase
                .from("contacts")
                .insert({
                  organization_id: orgId,
                  full_name: contact.name || "Sem nome",
                  email,
                  phone,
                  source: "kommo",
                  source_external_id: `kommo_${contact.id}`,
                  company_id: companyId,
                  owner_user_id: ownerUserId,
                })
                .select("id")
                .single();

              if (insertError) {
                errors.push({ type: "contact", kommo_id: contact.id, error: insertError.message });
              } else {
                importedContacts++;
                importedContactIds.push(newContact.id);
                kommoContactIdMap[String(contact.id)] = newContact.id;
              }
            } catch (err: any) {
              errors.push({ type: "contact", kommo_id: contact.id, error: err.message });
            }
          }

          if (contacts.length < PAGE_SIZE) {
            cursor.contacts_complete = true;
            cursor.phase = getNextPhase("contacts", cfg);
          } else {
            cursor.contacts_page++;
          }
        }
      }
      cursor.kommo_contact_id_map = kommoContactIdMap;
    }

    // ============ PHASE: LEADS ============
    if (cursor.phase === "leads" && !cursor.leads_complete) {
      console.log(`Processing leads page ${cursor.leads_page}`);

      const leadsResponse = await fetchWithRetry(
        `${baseUrl}/leads?limit=${PAGE_SIZE}&page=${cursor.leads_page}&with=contacts`,
        { headers: apiHeaders }
      );

      if (leadsResponse.status === 204) {
        cursor.leads_complete = true;
        cursor.phase = getNextPhase("leads", cfg);
      } else {
        const leadsData = await leadsResponse.json();
        const leads = leadsData._embedded?.leads || [];

        if (cursor.leads_page === 1) {
          totalOpportunities = leadsData._page?.count || leads.length * 10;
        }

        if (leads.length === 0) {
          cursor.leads_complete = true;
          cursor.phase = getNextPhase("leads", cfg);
        } else {
          for (const lead of leads) {
            try {
              let contactId: string | null = null;
              const linkedContacts = lead._embedded?.contacts || [];

              for (const lc of linkedContacts) {
                if (kommoContactIdMap[String(lc.id)]) {
                  contactId = kommoContactIdMap[String(lc.id)];
                  break;
                }
              }

              // Try source_external_id lookup
              if (!contactId && linkedContacts.length > 0) {
                for (const lc of linkedContacts) {
                  const { data: ec } = await supabase
                    .from("contacts").select("id")
                    .eq("organization_id", orgId)
                    .eq("source_external_id", `kommo_${lc.id}`)
                    .is("deleted_at", null).maybeSingle();
                  if (ec) {
                    contactId = ec.id;
                    kommoContactIdMap[String(lc.id)] = ec.id;
                    break;
                  }
                }
              }

              if (!contactId) {
                skippedOpportunities++;
                continue;
              }

              const stageKey = `${lead.pipeline_id}_${lead.status_id}`;
              const mappedStageId = cfg.stage_mapping?.[stageKey];
              if (!mappedStageId) {
                skippedOpportunities++;
                continue;
              }

              const ownerUserId = lead.responsible_user_id
                ? kommoUserIdMap[String(lead.responsible_user_id)] || null
                : null;

              const { data: existingLead } = await supabase
                .from("opportunities").select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", `kommo_${lead.id}`)
                .is("deleted_at", null).maybeSingle();

              if (existingLead) {
                if (currentDuplicateMode === "skip") {
                  skippedOpportunities++;
                  continue;
                } else if (currentDuplicateMode === "update") {
                  await supabase.from("opportunities").update({
                    title: lead.name,
                    amount: lead.price || 0,
                    pipeline_stage_id: mappedStageId,
                    contact_id: contactId,
                    owner_user_id: ownerUserId || undefined,
                    updated_at: new Date().toISOString(),
                  }).eq("id", existingLead.id);
                  importedOpportunities++;
                  importedOpportunityIds.push(existingLead.id);
                  continue;
                }
              }

              const { data: newOpp, error: oppError } = await supabase
                .from("opportunities")
                .insert({
                  organization_id: orgId,
                  contact_id: contactId,
                  title: lead.name || "Lead sem título",
                  amount: lead.price || 0,
                  pipeline_stage_id: mappedStageId,
                  source: "kommo",
                  source_external_id: `kommo_${lead.id}`,
                  owner_user_id: ownerUserId,
                })
                .select("id")
                .single();

              if (oppError) {
                errors.push({ type: "lead", kommo_id: lead.id, error: oppError.message });
              } else {
                importedOpportunities++;
                importedOpportunityIds.push(newOpp.id);
              }
            } catch (err: any) {
              errors.push({ type: "lead", kommo_id: lead.id, error: err.message });
            }
          }

          if (leads.length < PAGE_SIZE) {
            cursor.leads_complete = true;
            cursor.phase = getNextPhase("leads", cfg);
          } else {
            cursor.leads_page++;
          }
        }
      }
      cursor.kommo_contact_id_map = kommoContactIdMap;
    }

    // ============ PHASE: TASKS ============
    if (cursor.phase === "tasks" && !cursor.tasks_complete) {
      console.log(`Processing tasks page ${cursor.tasks_page}`);

      const resp = await fetchWithRetry(
        `${baseUrl}/tasks?limit=${PAGE_SIZE}&page=${cursor.tasks_page}`,
        { headers: apiHeaders }
      );

      if (resp.status === 204) {
        cursor.tasks_complete = true;
        cursor.phase = getNextPhase("tasks", cfg);
      } else {
        const data = await resp.json();
        const tasks = data._embedded?.tasks || [];

        if (tasks.length === 0) {
          cursor.tasks_complete = true;
          cursor.phase = getNextPhase("tasks", cfg);
        } else {
          const processedSoFar = (cursor.tasks_page - 1) * PAGE_SIZE + tasks.length;
          if (tasks.length === PAGE_SIZE) {
            totalTasks = Math.max(totalTasks, processedSoFar + PAGE_SIZE);
          } else {
            totalTasks = processedSoFar;
          }

          for (const task of tasks) {
            try {
              const sourceExternalId = `kommo_task_${task.id}`;

              const { data: existing } = await supabase
                .from("tasks").select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", sourceExternalId)
                .is("deleted_at", null).maybeSingle();

              if (existing) {
                if (currentDuplicateMode === "skip") continue;
                if (currentDuplicateMode === "update") {
                  await supabase.from("tasks").update({
                    title: task.text || "Tarefa Kommo",
                    status: task.is_completed ? "completed" : "pending",
                    updated_at: new Date().toISOString(),
                  }).eq("id", existing.id);
                  importedTasks++;
                  importedTaskIds.push(existing.id);
                  continue;
                }
              }

              // Resolve linked entity
              let contactId: string | null = null;
              let opportunityId: string | null = null;
              if (task.entity_type === "contacts" && task.entity_id) {
                contactId = kommoContactIdMap[String(task.entity_id)] || null;
              } else if (task.entity_type === "leads" && task.entity_id) {
                // Find opportunity by source_external_id
                const { data: opp } = await supabase
                  .from("opportunities").select("id")
                  .eq("organization_id", orgId)
                  .eq("source_external_id", `kommo_${task.entity_id}`)
                  .is("deleted_at", null).maybeSingle();
                opportunityId = opp?.id || null;
              }

              // assigned_user_id is NOT NULL — must have a value
              const assignedUserId = task.responsible_user_id
                ? (kommoUserIdMap[String(task.responsible_user_id)] || defaultUserId)
                : defaultUserId;

              if (!assignedUserId) {
                errors.push({ type: "task", kommo_id: task.id, error: "No fallback user available" });
                continue;
              }

              const dueAt = task.complete_till
                ? new Date(task.complete_till * 1000).toISOString()
                : null;

              const { data: newTask, error: insertErr } = await supabase
                .from("tasks")
                .insert({
                  organization_id: orgId,
                  title: task.text || "Tarefa Kommo",
                  description: `Importado da Kommo (ID: ${task.id})`,
                  status: task.is_completed ? "completed" : "pending",
                  due_at: dueAt,
                  contact_id: contactId,
                  opportunity_id: opportunityId,
                  assigned_user_id: assignedUserId,
                  created_by_user_id: assignedUserId,
                  source_external_id: sourceExternalId,
                })
                .select("id")
                .single();

              if (!insertErr && newTask) {
                importedTasks++;
                importedTaskIds.push(newTask.id);
              } else if (insertErr) {
                errors.push({ type: "task", kommo_id: task.id, error: insertErr.message });
              }
            } catch (err: any) {
              errors.push({ type: "task", kommo_id: task.id, error: err.message });
            }
          }

          if (tasks.length < PAGE_SIZE) {
            cursor.tasks_complete = true;
            cursor.phase = getNextPhase("tasks", cfg);
          } else {
            cursor.tasks_page++;
          }
        }
      }
    }

    // ============ PHASE: NOTES (CONTACTS) ============
    if (cursor.phase === "notes_contacts" && !cursor.notes_contacts_complete) {
      console.log(`Processing contact notes page ${cursor.notes_contacts_page}`);

      const resp = await fetchWithRetry(
        `${baseUrl}/contacts/notes?limit=${PAGE_SIZE}&page=${cursor.notes_contacts_page}`,
        { headers: apiHeaders }
      );

      if (resp.status === 204) {
        cursor.notes_contacts_complete = true;
        cursor.phase = getNextPhase("notes_contacts", cfg);
      } else {
        const data = await resp.json();
        const notes = data._embedded?.notes || [];

        if (notes.length === 0) {
          cursor.notes_contacts_complete = true;
          cursor.phase = getNextPhase("notes_contacts", cfg);
        } else {
          const processedSoFar = (cursor.notes_contacts_page - 1) * PAGE_SIZE + notes.length;
          if (notes.length === PAGE_SIZE) {
            totalNotes = Math.max(totalNotes, processedSoFar + PAGE_SIZE);
          } else {
            totalNotes = Math.max(totalNotes, processedSoFar);
          }

          for (const note of notes) {
            try {
              const sourceExternalId = `kommo_note_${note.id}`;

              const { data: existing } = await supabase
                .from("activities").select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", sourceExternalId)
                .is("deleted_at", null).maybeSingle();

              if (existing) {
                if (currentDuplicateMode === "skip") continue;
              }

              const contactId = kommoContactIdMap[String(note.entity_id)] || null;
              const createdByUserId = note.created_by
                ? (kommoUserIdMap[String(note.created_by)] || null)
                : null;

              // Map note_type to activity_type
              let activityType: string = "note";
              if (note.note_type === "call_in" || note.note_type === "call_out") {
                activityType = "call";
              }

              // Check for media attachment
              let mediaSourceUrl: string | null = null;
              let mediaStatus = "none";
              if (note.params?.file_name || note.params?.link) {
                mediaSourceUrl = note.params?.link || null;
                mediaStatus = mediaSourceUrl ? "pending" : "none";
              }

              const { data: newActivity, error: insertErr } = await supabase
                .from("activities")
                .insert({
                  organization_id: orgId,
                  contact_id: contactId,
                  activity_type: activityType,
                  title: note.note_type === "common" ? "Nota" : `Nota (${note.note_type})`,
                  body: note.params?.text || note.text || "",
                  source_external_id: sourceExternalId,
                  created_by_user_id: createdByUserId,
                  occurred_at: note.created_at ? new Date(note.created_at * 1000).toISOString() : new Date().toISOString(),
                  media_source_url: mediaSourceUrl,
                  media_status: mediaStatus,
                })
                .select("id")
                .single();

              if (!insertErr && newActivity) {
                importedNotes++;
                importedActivityIds.push(newActivity.id);
              } else if (insertErr) {
                errors.push({ type: "note_contact", kommo_id: note.id, error: insertErr.message });
              }
            } catch (err: any) {
              errors.push({ type: "note_contact", kommo_id: note.id, error: err.message });
            }
          }

          if (notes.length < PAGE_SIZE) {
            cursor.notes_contacts_complete = true;
            cursor.phase = getNextPhase("notes_contacts", cfg);
          } else {
            cursor.notes_contacts_page++;
          }
        }
      }
    }

    // ============ PHASE: NOTES (LEADS) ============
    if (cursor.phase === "notes_leads" && !cursor.notes_leads_complete) {
      console.log(`Processing lead notes page ${cursor.notes_leads_page}`);

      const resp = await fetchWithRetry(
        `${baseUrl}/leads/notes?limit=${PAGE_SIZE}&page=${cursor.notes_leads_page}`,
        { headers: apiHeaders }
      );

      if (resp.status === 204) {
        cursor.notes_leads_complete = true;
        cursor.phase = getNextPhase("notes_leads", cfg);
      } else {
        const data = await resp.json();
        const notes = data._embedded?.notes || [];

        if (notes.length === 0) {
          cursor.notes_leads_complete = true;
          cursor.phase = getNextPhase("notes_leads", cfg);
        } else {
          for (const note of notes) {
            try {
              const sourceExternalId = `kommo_note_${note.id}`;

              const { data: existing } = await supabase
                .from("activities").select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", sourceExternalId)
                .is("deleted_at", null).maybeSingle();

              if (existing) {
                if (currentDuplicateMode === "skip") continue;
              }

              // For lead notes, find the opportunity
              let opportunityId: string | null = null;
              if (note.entity_id) {
                const { data: opp } = await supabase
                  .from("opportunities").select("id")
                  .eq("organization_id", orgId)
                  .eq("source_external_id", `kommo_${note.entity_id}`)
                  .is("deleted_at", null).maybeSingle();
                opportunityId = opp?.id || null;
              }

              const createdByUserId = note.created_by
                ? (kommoUserIdMap[String(note.created_by)] || null)
                : null;

              let activityType: string = "note";
              if (note.note_type === "call_in" || note.note_type === "call_out") {
                activityType = "call";
              }

              let mediaSourceUrl: string | null = null;
              let mediaStatus = "none";
              if (note.params?.file_name || note.params?.link) {
                mediaSourceUrl = note.params?.link || null;
                mediaStatus = mediaSourceUrl ? "pending" : "none";
              }

              const { data: newActivity, error: insertErr } = await supabase
                .from("activities")
                .insert({
                  organization_id: orgId,
                  opportunity_id: opportunityId,
                  activity_type: activityType,
                  title: note.note_type === "common" ? "Nota" : `Nota (${note.note_type})`,
                  body: note.params?.text || note.text || "",
                  source_external_id: sourceExternalId,
                  created_by_user_id: createdByUserId,
                  occurred_at: note.created_at ? new Date(note.created_at * 1000).toISOString() : new Date().toISOString(),
                  media_source_url: mediaSourceUrl,
                  media_status: mediaStatus,
                })
                .select("id")
                .single();

              if (!insertErr && newActivity) {
                importedNotes++;
                importedActivityIds.push(newActivity.id);
              } else if (insertErr) {
                errors.push({ type: "note_lead", kommo_id: note.id, error: insertErr.message });
              }
            } catch (err: any) {
              errors.push({ type: "note_lead", kommo_id: note.id, error: err.message });
            }
          }

          if (notes.length < PAGE_SIZE) {
            cursor.notes_leads_complete = true;
            cursor.phase = getNextPhase("notes_leads", cfg);
          } else {
            cursor.notes_leads_page++;
          }
        }
      }
    }

    // ============ PHASE: EVENTS ============
    if (cursor.phase === "events" && !cursor.events_complete) {
      console.log(`Processing events page ${cursor.events_page}`);

      const resp = await fetchWithRetry(
        `${baseUrl}/events?limit=${PAGE_SIZE}&page=${cursor.events_page}&filter[type]=lead_status_changed,entity_linked`,
        { headers: apiHeaders }
      );

      if (resp.status === 204) {
        cursor.events_complete = true;
        cursor.phase = "done";
      } else {
        const data = await resp.json();
        const events = data._embedded?.events || [];

        if (events.length === 0) {
          cursor.events_complete = true;
          cursor.phase = "done";
        } else {
          const processedSoFar = (cursor.events_page - 1) * PAGE_SIZE + events.length;
          if (events.length === PAGE_SIZE) {
            totalEvents = Math.max(totalEvents, processedSoFar + PAGE_SIZE);
          } else {
            totalEvents = processedSoFar;
          }

          for (const event of events) {
            try {
              const sourceExternalId = `kommo_event_${event.id}`;

              const { data: existing } = await supabase
                .from("activities").select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", sourceExternalId)
                .is("deleted_at", null).maybeSingle();

              if (existing) continue;

              let contactId: string | null = null;
              let opportunityId: string | null = null;
              if (event.entity_type === "contact" && event.entity_id) {
                contactId = kommoContactIdMap[String(event.entity_id)] || null;
              } else if (event.entity_type === "lead" && event.entity_id) {
                const { data: opp } = await supabase
                  .from("opportunities").select("id")
                  .eq("organization_id", orgId)
                  .eq("source_external_id", `kommo_${event.entity_id}`)
                  .is("deleted_at", null).maybeSingle();
                opportunityId = opp?.id || null;
              }

              const createdByUserId = event.created_by
                ? (kommoUserIdMap[String(event.created_by)] || null)
                : null;

              const { data: newActivity, error: insertErr } = await supabase
                .from("activities")
                .insert({
                  organization_id: orgId,
                  contact_id: contactId,
                  opportunity_id: opportunityId,
                  activity_type: "pipeline_stage_change",
                  title: `Evento: ${event.type}`,
                  body: JSON.stringify(event.value_after || event.value_before || {}),
                  source_external_id: sourceExternalId,
                  created_by_user_id: createdByUserId,
                  occurred_at: event.created_at ? new Date(event.created_at * 1000).toISOString() : new Date().toISOString(),
                })
                .select("id")
                .single();

              if (!insertErr && newActivity) {
                importedEvents++;
                importedActivityIds.push(newActivity.id);
              }
            } catch (err: any) {
              errors.push({ type: "event", kommo_id: event.id, error: err.message });
            }
          }

          if (events.length < PAGE_SIZE) {
            cursor.events_complete = true;
            cursor.phase = "done";
          } else {
            cursor.events_page++;
          }
        }
      }
    }

    // ============ PROGRESS CALCULATION ============
    let progressPercent = 0;
    if (cursor.phase === "done") {
      progressPercent = 100;
    } else {
      const currentIdx = getPhaseIndex(cursor.phase);
      const totalPhases = PHASE_ORDER.length;
      // Base progress from completed phases
      const baseProgress = (currentIdx / totalPhases) * 100;
      progressPercent = Math.min(Math.round(baseProgress), 99);
    }

    // Error threshold check
    const totalProcessed = importedContacts + skippedContacts + importedOpportunities + skippedOpportunities +
      importedCompanies + importedTasks + importedNotes + importedEvents;
    const errorRate = totalProcessed > 0 ? (errors.length / totalProcessed) * 100 : 0;
    const shouldPause = errorRate > 20 && totalProcessed > 50;

    let status = "running";
    if (cursor.phase === "done") status = "completed";
    else if (shouldPause) status = "paused";

    // Update import log
    await supabase
      .from("import_logs")
      .update({
        status,
        cursor_state: cursor,
        total_contacts: totalContacts,
        imported_contacts: importedContacts,
        skipped_contacts: skippedContacts,
        total_opportunities: totalOpportunities,
        imported_opportunities: importedOpportunities,
        skipped_opportunities: skippedOpportunities,
        total_companies: totalCompanies,
        imported_companies: importedCompanies,
        total_tasks: totalTasks,
        imported_tasks: importedTasks,
        total_notes: totalNotes,
        imported_notes: importedNotes,
        total_events: totalEvents,
        imported_events: importedEvents,
        total_custom_fields: totalCustomFields,
        imported_custom_fields: importedCustomFields,
        progress_percent: progressPercent,
        imported_contact_ids: importedContactIds,
        imported_opportunity_ids: importedOpportunityIds,
        imported_company_ids: importedCompanyIds,
        imported_task_ids: importedTaskIds,
        imported_activity_ids: importedActivityIds,
        errors,
        error_count: errors.length,
        rollback_available: cursor.phase === "done",
        completed_at: cursor.phase === "done" ? new Date().toISOString() : null,
      })
      .eq("id", import_log_id);

    const shouldContinue = cursor.phase !== "done" && !shouldPause;

    return new Response(
      JSON.stringify({
        success: true,
        continue: shouldContinue,
        phase: cursor.phase,
        progress: progressPercent,
        imported_contacts: importedContacts,
        imported_opportunities: importedOpportunities,
        imported_companies: importedCompanies,
        imported_tasks: importedTasks,
        imported_notes: importedNotes,
        imported_events: importedEvents,
        status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Kommo migration error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
