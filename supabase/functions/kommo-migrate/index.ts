import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://qvmtzfvkhkhkhdpclzua.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 50;
const KOMMO_RATE_LIMIT_DELAY = 150; // ms between requests (7 req/s max)

// Helper to extract custom field value from Kommo contact/lead
function getCustomFieldValue(customFields: any[], fieldCode: string): string | null {
  if (!customFields) return null;
  const field = customFields.find((f: any) => f.field_code === fieldCode);
  return field?.values?.[0]?.value || null;
}

// Normalize phone to E.164 format
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) {
    digits = '55' + digits;
  }
  return '+' + digits;
}

// Split name into first and last name
function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  return { firstName, lastName };
}

// Delay helper for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      organization_id,
      subdomain,
      access_token,
      import_log_id,
      stage_mapping,
      duplicate_mode = 'skip',
      import_orphan_contacts = true,
    } = await req.json();

    if (!organization_id || !subdomain || !access_token || !import_log_id) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios faltando" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update log to running
    await supabase
      .from('import_logs')
      .update({ 
        status: 'running', 
        started_at: new Date().toISOString(),
        config: { subdomain, stage_mapping, duplicate_mode, import_orphan_contacts }
      })
      .eq('id', import_log_id);

    const baseUrl = `https://${subdomain}.kommo.com/api/v4`;
    const headers = {
      "Authorization": `Bearer ${access_token}`,
      "Content-Type": "application/json",
    };

    const errors: any[] = [];
    const importedContactIds: string[] = [];
    const importedOpportunityIds: string[] = [];
    const kommoToContactIdMap: Record<number, string> = {};
    
    let totalContacts = 0;
    let importedContacts = 0;
    let skippedContacts = 0;
    let totalLeads = 0;
    let importedOpportunities = 0;
    let skippedOpportunities = 0;

    // Helper to update progress
    const updateProgress = async (data: any) => {
      await supabase
        .from('import_logs')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', import_log_id);
    };

    // ============ STEP 1: Import Contacts ============
    let contactPage = 1;
    let hasMoreContacts = true;
    
    while (hasMoreContacts) {
      await delay(KOMMO_RATE_LIMIT_DELAY);
      
      const contactsResponse = await fetch(
        `${baseUrl}/contacts?limit=250&page=${contactPage}&with=leads`,
        { headers }
      );
      
      if (!contactsResponse.ok) {
        if (contactsResponse.status === 429) {
          // Rate limited - wait and retry
          await delay(1000);
          continue;
        }
        throw new Error(`Erro ao buscar contatos: ${contactsResponse.status}`);
      }
      
      const contactsData = await contactsResponse.json();
      const contacts = contactsData._embedded?.contacts || [];
      
      if (contacts.length === 0) {
        hasMoreContacts = false;
        break;
      }

      totalContacts += contacts.length;

      // Process contacts in batches
      for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const batch = contacts.slice(i, i + BATCH_SIZE);
        
        for (const contact of batch) {
          try {
            const hasLeads = (contact._embedded?.leads?.length || 0) > 0;
            
            // Skip orphan contacts if not importing them
            if (!import_orphan_contacts && !hasLeads) {
              skippedContacts++;
              continue;
            }

            const email = getCustomFieldValue(contact.custom_fields_values, 'EMAIL');
            const phone = normalizePhone(getCustomFieldValue(contact.custom_fields_values, 'PHONE'));
            const { firstName, lastName } = splitName(contact.name || 'Sem nome');

            // Check for duplicates
            if (duplicate_mode !== 'create') {
              const { data: existing } = await supabase
                .from('contacts')
                .select('id')
                .eq('organization_id', organization_id)
                .or(`email.eq.${email || 'NONE'},phone.eq.${phone || 'NONE'}`)
                .limit(1);

              if (existing && existing.length > 0) {
                if (duplicate_mode === 'skip') {
                  skippedContacts++;
                  kommoToContactIdMap[contact.id] = existing[0].id;
                  continue;
                } else if (duplicate_mode === 'update') {
                  // Update existing contact
                  const { error: updateError } = await supabase
                    .from('contacts')
                    .update({
                      full_name: contact.name,
                      first_name: firstName,
                      last_name: lastName,
                      email: email || undefined,
                      phone: phone || undefined,
                      source_external_id: String(contact.id),
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', existing[0].id);

                  if (updateError) throw updateError;
                  
                  kommoToContactIdMap[contact.id] = existing[0].id;
                  importedContacts++;
                  continue;
                }
              }
            }

            // Insert new contact
            const { data: newContact, error: insertError } = await supabase
              .from('contacts')
              .insert({
                organization_id,
                full_name: contact.name || 'Sem nome',
                first_name: firstName,
                last_name: lastName,
                email: email,
                phone: phone,
                source: 'kommo',
                source_external_id: String(contact.id),
                lifecycle_stage: 'lead',
              })
              .select('id')
              .single();

            if (insertError) throw insertError;
            
            kommoToContactIdMap[contact.id] = newContact.id;
            importedContactIds.push(newContact.id);
            importedContacts++;

          } catch (error: any) {
            errors.push({
              type: 'contact',
              kommo_id: contact.id,
              name: contact.name,
              error: error.message,
            });
          }
        }

        // Update progress after each batch
        const progressPercent = Math.round((importedContacts + skippedContacts) / Math.max(totalContacts, 1) * 50);
        await updateProgress({
          total_contacts: totalContacts,
          imported_contacts: importedContacts,
          skipped_contacts: skippedContacts,
          progress_percent: progressPercent,
          last_processed_item: `Contato: ${batch[batch.length - 1]?.name || 'N/A'}`,
          imported_contact_ids: importedContactIds,
          error_count: errors.length,
          errors: errors.slice(-50), // Keep last 50 errors
        });

        // Check error threshold (20%)
        const totalProcessed = importedContacts + skippedContacts;
        if (totalProcessed > 10 && errors.length / totalProcessed > 0.2) {
          await updateProgress({
            status: 'paused',
            errors,
            error_count: errors.length,
          });
          return new Response(
            JSON.stringify({ 
              status: 'paused', 
              message: 'Migração pausada: mais de 20% de erros detectados',
              error_count: errors.length,
              total_processed: totalProcessed,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      hasMoreContacts = !!contactsData._links?.next;
      contactPage++;
    }

    // ============ STEP 2: Import Leads/Opportunities ============
    let leadPage = 1;
    let hasMoreLeads = true;
    
    while (hasMoreLeads) {
      await delay(KOMMO_RATE_LIMIT_DELAY);
      
      const leadsResponse = await fetch(
        `${baseUrl}/leads?limit=250&page=${leadPage}&with=contacts`,
        { headers }
      );
      
      if (!leadsResponse.ok) {
        if (leadsResponse.status === 429) {
          await delay(1000);
          continue;
        }
        throw new Error(`Erro ao buscar leads: ${leadsResponse.status}`);
      }
      
      const leadsData = await leadsResponse.json();
      const leads = leadsData._embedded?.leads || [];
      
      if (leads.length === 0) {
        hasMoreLeads = false;
        break;
      }

      totalLeads += leads.length;

      // Process leads in batches
      for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batch = leads.slice(i, i + BATCH_SIZE);
        
        for (const lead of batch) {
          try {
            // Check for duplicates by source_external_id
            if (duplicate_mode === 'skip') {
              const { data: existing } = await supabase
                .from('opportunities')
                .select('id')
                .eq('organization_id', organization_id)
                .eq('source_external_id', String(lead.id))
                .limit(1);

              if (existing && existing.length > 0) {
                skippedOpportunities++;
                continue;
              }
            }

            // Get mapped stage
            const kommoStageKey = `${lead.pipeline_id}_${lead.status_id}`;
            let pipelineStageId = stage_mapping?.[kommoStageKey] || stage_mapping?.[String(lead.status_id)];
            
            // If no mapping, get first stage of org
            if (!pipelineStageId) {
              const { data: defaultStage } = await supabase
                .from('pipeline_stages')
                .select('id')
                .eq('organization_id', organization_id)
                .order('order_index')
                .limit(1);
              
              pipelineStageId = defaultStage?.[0]?.id;
            }

            if (!pipelineStageId) {
              throw new Error('Nenhuma etapa de pipeline disponível');
            }

            // Get contact ID from mapping
            const kommoContactId = lead._embedded?.contacts?.[0]?.id;
            const contactId = kommoContactId ? kommoToContactIdMap[kommoContactId] : null;

            // Insert opportunity
            const { data: newOpp, error: insertError } = await supabase
              .from('opportunities')
              .insert({
                organization_id,
                title: lead.name || 'Oportunidade Importada',
                amount: lead.price || 0,
                pipeline_stage_id: pipelineStageId,
                contact_id: contactId,
                source: 'kommo',
                source_external_id: String(lead.id),
                close_date: lead.closest_task_at 
                  ? new Date(lead.closest_task_at * 1000).toISOString().split('T')[0]
                  : null,
              })
              .select('id')
              .single();

            if (insertError) throw insertError;
            
            importedOpportunityIds.push(newOpp.id);
            importedOpportunities++;

          } catch (error: any) {
            errors.push({
              type: 'lead',
              kommo_id: lead.id,
              name: lead.name,
              error: error.message,
            });
          }
        }

        // Update progress after each batch
        const progressPercent = 50 + Math.round((importedOpportunities + skippedOpportunities) / Math.max(totalLeads, 1) * 50);
        await updateProgress({
          total_opportunities: totalLeads,
          imported_opportunities: importedOpportunities,
          skipped_opportunities: skippedOpportunities,
          progress_percent: Math.min(progressPercent, 100),
          last_processed_item: `Lead: ${batch[batch.length - 1]?.name || 'N/A'}`,
          imported_opportunity_ids: importedOpportunityIds,
          error_count: errors.length,
          errors: errors.slice(-50),
        });
      }

      hasMoreLeads = !!leadsData._links?.next;
      leadPage++;
    }

    // ============ STEP 3: Finalize ============
    await updateProgress({
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress_percent: 100,
      total_contacts: totalContacts,
      imported_contacts: importedContacts,
      skipped_contacts: skippedContacts,
      total_opportunities: totalLeads,
      imported_opportunities: importedOpportunities,
      skipped_opportunities: skippedOpportunities,
      imported_contact_ids: importedContactIds,
      imported_opportunity_ids: importedOpportunityIds,
      error_count: errors.length,
      errors: errors.slice(-100),
    });

    return new Response(
      JSON.stringify({
        status: 'completed',
        total_contacts: totalContacts,
        imported_contacts: importedContacts,
        skipped_contacts: skippedContacts,
        total_leads: totalLeads,
        imported_opportunities: importedOpportunities,
        skipped_opportunities: skippedOpportunities,
        error_count: errors.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro interno na migração";
    console.error("Migration error:", error);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
