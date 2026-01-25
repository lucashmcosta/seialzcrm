import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { organization_id, subdomain, access_token, batch_size = 50, dry_run = false } = await req.json();

    if (!organization_id || !subdomain || !access_token) {
      throw new Error("organization_id, subdomain e access_token são obrigatórios");
    }

    const baseUrl = `https://${subdomain}.kommo.com/api/v4`;
    const headers = {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    };

    // Find orphan opportunities (Kommo source, no contact)
    const { data: orphanOpps, error: fetchError } = await supabase
      .from("opportunities")
      .select("id, source_external_id, title")
      .eq("organization_id", organization_id)
      .eq("source", "kommo")
      .is("contact_id", null)
      .is("deleted_at", null)
      .limit(batch_size);

    if (fetchError) {
      throw new Error(`Erro ao buscar oportunidades órfãs: ${fetchError.message}`);
    }

    console.log(`Found ${orphanOpps?.length || 0} orphan opportunities`);

    const results = {
      total: orphanOpps?.length || 0,
      fixed: 0,
      not_found: 0,
      errors: [] as any[],
      details: [] as any[],
    };

    if (!orphanOpps || orphanOpps.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma oportunidade órfã encontrada", results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-load all contacts for this org to speed up matching
    const { data: allContacts } = await supabase
      .from("contacts")
      .select("id, email, phone, source_external_id")
      .eq("organization_id", organization_id)
      .is("deleted_at", null);

    // Create lookup maps
    const contactByEmail = new Map<string, string>();
    const contactByPhone = new Map<string, string>();
    const contactByKommoId = new Map<string, string>();

    allContacts?.forEach((c: any) => {
      if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
      if (c.phone) contactByPhone.set(c.phone, c.id);
      if (c.source_external_id?.startsWith("kommo_")) {
        contactByKommoId.set(c.source_external_id, c.id);
      }
    });

    // Process each orphan opportunity
    for (const opp of orphanOpps) {
      try {
        // Extract Kommo lead ID
        const kommoLeadId = opp.source_external_id?.replace("kommo_", "");
        if (!kommoLeadId) {
          results.errors.push({ opp_id: opp.id, error: "No Kommo ID found" });
          continue;
        }

        // Fetch lead details from Kommo
        const leadResponse = await fetchWithRetry(
          `${baseUrl}/leads/${kommoLeadId}?with=contacts`,
          { headers }
        );
        const leadData = await leadResponse.json();
        
        const linkedContacts = leadData._embedded?.contacts || [];
        
        if (linkedContacts.length === 0) {
          results.not_found++;
          results.details.push({ opp_id: opp.id, title: opp.title, reason: "No contacts in Kommo" });
          continue;
        }

        // Try to find contact in CRM
        let foundContactId: string | null = null;
        
        for (const linkedContact of linkedContacts) {
          // First check by Kommo ID
          const kommoContactKey = `kommo_${linkedContact.id}`;
          if (contactByKommoId.has(kommoContactKey)) {
            foundContactId = contactByKommoId.get(kommoContactKey)!;
            break;
          }
          
          // If not found, fetch full contact details from Kommo
          try {
            const contactResponse = await fetchWithRetry(
              `${baseUrl}/contacts/${linkedContact.id}`,
              { headers }
            );
            const contactData = await contactResponse.json();
            
            // Extract email and phone
            const email = contactData.custom_fields_values?.find(
              (f: any) => f.field_code === "EMAIL"
            )?.values?.[0]?.value?.toLowerCase();

            const phoneRaw = contactData.custom_fields_values?.find(
              (f: any) => f.field_code === "PHONE"
            )?.values?.[0]?.value;
            const phone = normalizePhone(phoneRaw);
            
            // Try to match by email
            if (email && contactByEmail.has(email)) {
              foundContactId = contactByEmail.get(email)!;
              
              // Update the contact with Kommo ID for future reference
              if (!dry_run) {
                await supabase
                  .from("contacts")
                  .update({ source_external_id: kommoContactKey })
                  .eq("id", foundContactId);
              }
              break;
            }
            
            // Try to match by phone
            if (phone && contactByPhone.has(phone)) {
              foundContactId = contactByPhone.get(phone)!;
              
              // Update the contact with Kommo ID for future reference
              if (!dry_run) {
                await supabase
                  .from("contacts")
                  .update({ source_external_id: kommoContactKey })
                  .eq("id", foundContactId);
              }
              break;
            }
          } catch (contactErr: any) {
            console.log(`Error fetching contact ${linkedContact.id}: ${contactErr.message}`);
          }
          
          // Small delay to respect rate limits
          await delay(100);
        }
        
        if (foundContactId) {
          if (!dry_run) {
            // Update the opportunity with the found contact
            const { error: updateError } = await supabase
              .from("opportunities")
              .update({ contact_id: foundContactId })
              .eq("id", opp.id);
            
            if (updateError) {
              results.errors.push({ opp_id: opp.id, error: updateError.message });
            } else {
              results.fixed++;
              results.details.push({ 
                opp_id: opp.id, 
                title: opp.title, 
                contact_id: foundContactId,
                status: "fixed" 
              });
            }
          } else {
            results.fixed++;
            results.details.push({ 
              opp_id: opp.id, 
              title: opp.title, 
              contact_id: foundContactId,
              status: "would_fix" 
            });
          }
        } else {
          results.not_found++;
          results.details.push({ opp_id: opp.id, title: opp.title, reason: "Contact not found in CRM" });
        }
        
        // Small delay between opportunities
        await delay(150);
        
      } catch (err: any) {
        results.errors.push({ opp_id: opp.id, error: err.message });
      }
    }

    // Check if there are more orphans
    const { count: remainingCount } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .eq("source", "kommo")
      .is("contact_id", null)
      .is("deleted_at", null);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run,
        results,
        remaining: remainingCount || 0,
        message: dry_run 
          ? `Simulação: ${results.fixed} seriam corrigidos de ${results.total}`
          : `Corrigidos ${results.fixed} de ${results.total} oportunidades. Restam ${remainingCount || 0} órfãs.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
