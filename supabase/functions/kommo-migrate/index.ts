import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CursorState {
  phase: "contacts" | "leads" | "done";
  contacts_page: number;
  leads_page: number;
  contacts_complete: boolean;
  leads_complete: boolean;
}

interface ImportLog {
  id: string;
  organization_id: string;
  config: {
    stage_mapping?: Record<string, string>;
    duplicate_mode?: string;
    import_orphan_contacts?: boolean;
    subdomain?: string;
    access_token?: string;
  };
  cursor_state: CursorState;
  status: string;
  total_contacts: number;
  imported_contacts: number;
  skipped_contacts: number;
  total_opportunities: number;
  imported_opportunities: number;
  skipped_opportunities: number;
  progress_percent: number;
  imported_contact_ids: string[];
  imported_opportunity_ids: string[];
  errors: any[];
  error_count: number;
}

// Page size for Kommo API
const PAGE_SIZE = 250;

// Delay helper for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with exponential backoff retry for rate limiting
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 5
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.ok) {
      return response;
    }
    
    if (response.status === 429) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`Rate limited (429). Retry ${attempt + 1}/${maxRetries} in ${backoffMs}ms`);
      await delay(backoffMs);
      continue;
    }
    
    lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    break;
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Normalize phone to E.164 format
function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { import_log_id, subdomain, access_token, organization_id, stage_mapping, duplicate_mode, import_orphan_contacts } = await req.json();

    if (!import_log_id) {
      throw new Error("import_log_id é obrigatório");
    }

    // Fetch import log
    const { data: importLog, error: logError } = await supabase
      .from("import_logs")
      .select("*")
      .eq("id", import_log_id)
      .single();

    if (logError || !importLog) {
      throw new Error("Import log não encontrado");
    }

    const log = importLog as ImportLog;

    // Initialize config on first call
    if (log.status === "pending") {
      const config = {
        subdomain: subdomain || log.config?.subdomain,
        access_token: access_token || log.config?.access_token,
        stage_mapping: stage_mapping || log.config?.stage_mapping,
        duplicate_mode: duplicate_mode || log.config?.duplicate_mode || "skip",
        import_orphan_contacts: import_orphan_contacts ?? log.config?.import_orphan_contacts ?? true,
      };

      await supabase
        .from("import_logs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          config,
          cursor_state: {
            phase: "contacts",
            contacts_page: 1,
            leads_page: 1,
            contacts_complete: false,
            leads_complete: false,
          },
        })
        .eq("id", import_log_id);

      log.config = config;
      log.status = "running";
      log.cursor_state = {
        phase: "contacts",
        contacts_page: 1,
        leads_page: 1,
        contacts_complete: false,
        leads_complete: false,
      };
    }

    const currentSubdomain = log.config?.subdomain;
    const currentToken = log.config?.access_token;
    const currentStageMapping = log.config?.stage_mapping || {};
    const currentDuplicateMode = log.config?.duplicate_mode || "skip";
    const currentImportOrphan = log.config?.import_orphan_contacts ?? true;
    const orgId = log.organization_id;

    if (!currentSubdomain || !currentToken) {
      throw new Error("Credenciais não encontradas no config");
    }

    const baseUrl = `https://${currentSubdomain}.kommo.com/api/v4`;
    const headers = {
      Authorization: `Bearer ${currentToken}`,
      "Content-Type": "application/json",
    };

    let cursor = log.cursor_state || {
      phase: "contacts" as const,
      contacts_page: 1,
      leads_page: 1,
      contacts_complete: false,
      leads_complete: false,
    };

    const errors: any[] = [...(log.errors || [])];
    let importedContacts = log.imported_contacts || 0;
    let skippedContacts = log.skipped_contacts || 0;
    let importedOpportunities = log.imported_opportunities || 0;
    let skippedOpportunities = log.skipped_opportunities || 0;
    let importedContactIds = [...(log.imported_contact_ids || [])];
    let importedOpportunityIds = [...(log.imported_opportunity_ids || [])];
    let totalContacts = log.total_contacts || 0;
    let totalOpportunities = log.total_opportunities || 0;

    // Create a map of Kommo contact IDs to CRM contact IDs
    const kommoContactIdMap: Record<number, string> = {};

    // Load existing contact mappings from previously imported contacts
    if (importedContactIds.length > 0) {
      const { data: existingContacts } = await supabase
        .from("contacts")
        .select("id, source_external_id")
        .in("id", importedContactIds);
      
      existingContacts?.forEach((c: any) => {
        if (c.source_external_id) {
          const kommoId = parseInt(c.source_external_id.replace("kommo_", ""));
          if (!isNaN(kommoId)) {
            kommoContactIdMap[kommoId] = c.id;
          }
        }
      });
    }

    // ============ PHASE: CONTACTS ============
    if (cursor.phase === "contacts" && !cursor.contacts_complete) {
      console.log(`Processing contacts page ${cursor.contacts_page}`);

      const contactsResponse = await fetchWithRetry(
        `${baseUrl}/contacts?limit=${PAGE_SIZE}&page=${cursor.contacts_page}&with=leads`,
        { headers }
      );

      const contactsData = await contactsResponse.json();
      const contacts = contactsData._embedded?.contacts || [];

      // Update total on first page
      if (cursor.contacts_page === 1) {
        totalContacts = contactsData._page?.count || contacts.length * 10;
      }

      if (contacts.length === 0) {
        cursor.contacts_complete = true;
        cursor.phase = "leads";
      } else {
        // Process this batch of contacts
        for (const contact of contacts) {
          try {
            const email = contact.custom_fields_values?.find(
              (f: any) => f.field_code === "EMAIL"
            )?.values?.[0]?.value?.toLowerCase();

            const phoneRaw = contact.custom_fields_values?.find(
              (f: any) => f.field_code === "PHONE"
            )?.values?.[0]?.value;
            const phone = normalizePhone(phoneRaw);

            // Check for duplicates
            let existingContact = null;
            if (email) {
              const { data } = await supabase
                .from("contacts")
                .select("id")
                .eq("organization_id", orgId)
                .eq("email", email)
                .is("deleted_at", null)
                .maybeSingle();
              existingContact = data;
            }
            if (!existingContact && phone) {
              const { data } = await supabase
                .from("contacts")
                .select("id")
                .eq("organization_id", orgId)
                .eq("phone", phone)
                .is("deleted_at", null)
                .maybeSingle();
              existingContact = data;
            }

            if (existingContact) {
              if (currentDuplicateMode === "skip") {
                skippedContacts++;
                kommoContactIdMap[contact.id] = existingContact.id;
                continue;
              } else if (currentDuplicateMode === "update") {
                await supabase
                  .from("contacts")
                  .update({
                    full_name: contact.name,
                    email: email || undefined,
                    phone: phone || undefined,
                    source_external_id: `kommo_${contact.id}`,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingContact.id);
                importedContacts++;
                importedContactIds.push(existingContact.id);
                kommoContactIdMap[contact.id] = existingContact.id;
                continue;
              }
            }

            // Create new contact
            const { data: newContact, error: insertError } = await supabase
              .from("contacts")
              .insert({
                organization_id: orgId,
                full_name: contact.name || "Sem nome",
                email,
                phone,
                source: "kommo",
                source_external_id: `kommo_${contact.id}`,
              })
              .select("id")
              .single();

            if (insertError) {
              errors.push({
                type: "contact",
                kommo_id: contact.id,
                error: insertError.message,
              });
            } else {
              importedContacts++;
              importedContactIds.push(newContact.id);
              kommoContactIdMap[contact.id] = newContact.id;
            }
          } catch (err: any) {
            errors.push({
              type: "contact",
              kommo_id: contact.id,
              error: err.message,
            });
          }
        }

        // Check if there are more pages
        if (contacts.length < PAGE_SIZE) {
          cursor.contacts_complete = true;
          cursor.phase = "leads";
        } else {
          cursor.contacts_page++;
        }
      }
    }

    // ============ PHASE: LEADS ============
    if (cursor.phase === "leads" && !cursor.leads_complete) {
      console.log(`Processing leads page ${cursor.leads_page}`);

      const leadsResponse = await fetchWithRetry(
        `${baseUrl}/leads?limit=${PAGE_SIZE}&page=${cursor.leads_page}&with=contacts`,
        { headers }
      );

      const leadsData = await leadsResponse.json();
      const leads = leadsData._embedded?.leads || [];

      // Update total on first page
      if (cursor.leads_page === 1) {
        totalOpportunities = leadsData._page?.count || leads.length * 10;
      }

      if (leads.length === 0) {
        cursor.leads_complete = true;
        cursor.phase = "done";
      } else {
        for (const lead of leads) {
          try {
            // Find associated contact
            let contactId: string | null = null;
            const linkedContacts = lead._embedded?.contacts || [];

            for (const linkedContact of linkedContacts) {
              if (kommoContactIdMap[linkedContact.id]) {
                contactId = kommoContactIdMap[linkedContact.id];
                break;
              }
            }

            // If no linked contact found, try to find by querying
            if (!contactId && linkedContacts.length > 0) {
              const { data: existingContact } = await supabase
                .from("contacts")
                .select("id")
                .eq("organization_id", orgId)
                .eq("source_external_id", `kommo_${linkedContacts[0].id}`)
                .is("deleted_at", null)
                .maybeSingle();
              
              if (existingContact) {
                contactId = existingContact.id;
              }
            }

            // Skip leads without contacts if not importing orphans
            if (!contactId && !currentImportOrphan) {
              skippedOpportunities++;
              continue;
            }

            // Map stage
            const stageKey = `${lead.pipeline_id}_${lead.status_id}`;
            const mappedStageId = currentStageMapping[stageKey];

            if (!mappedStageId) {
              skippedOpportunities++;
              continue;
            }

            // Check for duplicate leads
            const { data: existingLead } = await supabase
              .from("opportunities")
              .select("id")
              .eq("organization_id", orgId)
              .eq("source_external_id", `kommo_${lead.id}`)
              .is("deleted_at", null)
              .maybeSingle();

            if (existingLead) {
              if (currentDuplicateMode === "skip") {
                skippedOpportunities++;
                continue;
              } else if (currentDuplicateMode === "update") {
                await supabase
                  .from("opportunities")
                  .update({
                    title: lead.name,
                    amount: lead.price || 0,
                    pipeline_stage_id: mappedStageId,
                    contact_id: contactId,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingLead.id);
                importedOpportunities++;
                importedOpportunityIds.push(existingLead.id);
                continue;
              }
            }

            // Create new opportunity
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
              })
              .select("id")
              .single();

            if (oppError) {
              errors.push({
                type: "lead",
                kommo_id: lead.id,
                error: oppError.message,
              });
            } else {
              importedOpportunities++;
              importedOpportunityIds.push(newOpp.id);
            }
          } catch (err: any) {
            errors.push({
              type: "lead",
              kommo_id: lead.id,
              error: err.message,
            });
          }
        }

        // Check if there are more pages
        if (leads.length < PAGE_SIZE) {
          cursor.leads_complete = true;
          cursor.phase = "done";
        } else {
          cursor.leads_page++;
        }
      }
    }

    // Calculate progress
    const totalItems = totalContacts + totalOpportunities;
    const processedItems = importedContacts + skippedContacts + importedOpportunities + skippedOpportunities;
    const progressPercent = totalItems > 0 ? Math.min(Math.round((processedItems / totalItems) * 100), 100) : 0;

    // Check error threshold (20%)
    const errorRate = processedItems > 0 ? (errors.length / processedItems) * 100 : 0;
    const shouldPause = errorRate > 20 && processedItems > 50;

    // Determine final status
    let status = "running";
    if (cursor.phase === "done") {
      status = "completed";
    } else if (shouldPause) {
      status = "paused";
    }

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
        progress_percent: progressPercent,
        imported_contact_ids: importedContactIds,
        imported_opportunity_ids: importedOpportunityIds,
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
