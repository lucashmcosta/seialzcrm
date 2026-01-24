import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to extract custom field value from Kommo contact/lead
function getCustomFieldValue(customFields: any[], fieldCode: string): string | null {
  if (!customFields) return null;
  const field = customFields.find((f: any) => f.field_code === fieldCode);
  return field?.values?.[0]?.value || null;
}

// Normalize phone to E.164 format
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  // If starts with 0, remove it
  if (digits.startsWith('0')) digits = digits.substring(1);
  // If doesn't start with country code, assume Brazil (+55)
  if (!digits.startsWith('55') && digits.length <= 11) {
    digits = '55' + digits;
  }
  // Add + prefix
  return '+' + digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { subdomain, access_token } = await req.json();

    if (!subdomain || !access_token) {
      return new Response(
        JSON.stringify({ error: "Subdomínio e access token são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = `https://${subdomain}.kommo.com/api/v4`;
    const headers = {
      "Authorization": `Bearer ${access_token}`,
      "Content-Type": "application/json",
    };

    // Fetch first page of contacts to get total and sample
    const contactsResponse = await fetch(`${baseUrl}/contacts?limit=10&with=leads`, { headers });
    if (!contactsResponse.ok) {
      throw new Error(`Erro ao buscar contatos: ${contactsResponse.status}`);
    }
    const contactsData = await contactsResponse.json();

    // Fetch first page of leads to get total and sample
    const leadsResponse = await fetch(`${baseUrl}/leads?limit=10&with=contacts`, { headers });
    if (!leadsResponse.ok) {
      throw new Error(`Erro ao buscar leads: ${leadsResponse.status}`);
    }
    const leadsData = await leadsResponse.json();

    // Get total counts - Kommo API doesn't return total, we need to paginate or estimate
    // For preview, we'll fetch one page with limit=1 to check if there are more
    const contactsCountResponse = await fetch(`${baseUrl}/contacts?limit=250`, { headers });
    const contactsCountData = await contactsCountResponse.json();
    const totalContacts = contactsCountData._embedded?.contacts?.length || 0;
    const hasMoreContacts = !!contactsCountData._links?.next;

    const leadsCountResponse = await fetch(`${baseUrl}/leads?limit=250`, { headers });
    const leadsCountData = await leadsCountResponse.json();
    const totalLeads = leadsCountData._embedded?.leads?.length || 0;
    const hasMoreLeads = !!leadsCountData._links?.next;

    // Transform sample contacts
    const sampleContacts = (contactsData._embedded?.contacts || []).slice(0, 10).map((contact: any) => {
      const email = getCustomFieldValue(contact.custom_fields_values, 'EMAIL');
      const phone = getCustomFieldValue(contact.custom_fields_values, 'PHONE');
      
      return {
        kommo_id: contact.id,
        kommo_name: contact.name,
        kommo_email: email,
        kommo_phone: phone,
        crm_full_name: contact.name,
        crm_email: email,
        crm_phone: normalizePhone(phone),
        has_leads: (contact._embedded?.leads?.length || 0) > 0,
      };
    });

    // Transform sample leads
    const sampleLeads = (leadsData._embedded?.leads || []).slice(0, 10).map((lead: any) => ({
      kommo_id: lead.id,
      kommo_name: lead.name,
      kommo_price: lead.price,
      kommo_pipeline_id: lead.pipeline_id,
      kommo_status_id: lead.status_id,
      crm_title: lead.name,
      crm_amount: lead.price || 0,
      contact_name: lead._embedded?.contacts?.[0]?.name || null,
    }));

    return new Response(
      JSON.stringify({
        total_contacts: hasMoreContacts ? `${totalContacts}+` : totalContacts,
        total_leads: hasMoreLeads ? `${totalLeads}+` : totalLeads,
        total_contacts_number: totalContacts,
        total_leads_number: totalLeads,
        has_more_contacts: hasMoreContacts,
        has_more_leads: hasMoreLeads,
        sample_contacts: sampleContacts,
        sample_leads: sampleLeads,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro interno ao buscar preview";
    console.error("Error fetching Kommo preview:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
