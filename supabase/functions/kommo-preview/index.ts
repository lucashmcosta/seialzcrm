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
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) {
    digits = '55' + digits;
  }
  return '+' + digits;
}

// Fetch with retry for rate limiting
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) return response;
    if (response.status === 429) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      continue;
    }
    // 204 No Content means empty list
    if (response.status === 204) return response;
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  throw new Error('Max retries exceeded');
}

// Get count from a paginated endpoint by fetching limit=250 and checking _links.next
async function getEntityCount(baseUrl: string, headers: Record<string, string>, endpoint: string): Promise<{ count: number; hasMore: boolean }> {
  try {
    const response = await fetchWithRetry(`${baseUrl}/${endpoint}?limit=250`, { headers });
    if (response.status === 204) return { count: 0, hasMore: false };
    const data = await response.json();
    const key = endpoint.split('/')[0]; // e.g. "companies" from "companies"
    const items = data._embedded?.[key] || [];
    const hasMore = !!data._links?.next;
    
    if (!hasMore) {
      return { count: items.length, hasMore: false };
    }
    
    // If has more, try to get a better estimate by checking page count
    // Kommo sometimes returns _page with count info
    const pageCount = data._page?.count;
    if (pageCount && pageCount > items.length) {
      return { count: pageCount, hasMore: true };
    }
    
    return { count: items.length, hasMore: true };
  } catch (err) {
    console.error(`Error fetching ${endpoint}:`, err);
    return { count: 0, hasMore: false };
  }
}

// Get notes count using batch endpoint
async function getNotesCount(baseUrl: string, headers: Record<string, string>, entityType: string): Promise<{ count: number; hasMore: boolean }> {
  try {
    const response = await fetchWithRetry(`${baseUrl}/${entityType}/notes?limit=250`, { headers });
    if (response.status === 204) return { count: 0, hasMore: false };
    const data = await response.json();
    const items = data._embedded?.notes || [];
    const hasMore = !!data._links?.next;
    const pageCount = data._page?.count;
    
    if (pageCount && pageCount > items.length) {
      return { count: pageCount, hasMore: true };
    }
    return { count: items.length, hasMore };
  } catch (err) {
    console.error(`Error fetching ${entityType}/notes:`, err);
    return { count: 0, hasMore: false };
  }
}

// Get custom fields count for an entity type
async function getCustomFieldsCount(baseUrl: string, headers: Record<string, string>, entityType: string): Promise<number> {
  try {
    const response = await fetchWithRetry(`${baseUrl}/${entityType}/custom_fields`, { headers });
    if (response.status === 204) return 0;
    const data = await response.json();
    return data._embedded?.custom_fields?.length || 0;
  } catch (err) {
    console.error(`Error fetching ${entityType}/custom_fields:`, err);
    return 0;
  }
}

Deno.serve(async (req) => {
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

    // Fetch all counts and samples in parallel
    const [
      contactsSample,
      leadsSample,
      contactsCount,
      leadsCount,
      companiesCount,
      tasksCount,
      usersResponse,
      contactNotesCount,
      leadNotesCount,
      contactCustomFields,
      leadCustomFields,
      companyCustomFields,
    ] = await Promise.all([
      // Sample contacts (first 10)
      fetchWithRetry(`${baseUrl}/contacts?limit=10&with=leads`, { headers })
        .then(r => r.status === 204 ? { _embedded: { contacts: [] } } : r.json())
        .catch(() => ({ _embedded: { contacts: [] } })),
      // Sample leads (first 10)
      fetchWithRetry(`${baseUrl}/leads?limit=10&with=contacts`, { headers })
        .then(r => r.status === 204 ? { _embedded: { leads: [] } } : r.json())
        .catch(() => ({ _embedded: { leads: [] } })),
      // Counts
      getEntityCount(baseUrl, headers, "contacts"),
      getEntityCount(baseUrl, headers, "leads"),
      getEntityCount(baseUrl, headers, "companies"),
      getEntityCount(baseUrl, headers, "tasks"),
      // Users (full list — typically small)
      fetchWithRetry(`${baseUrl}/users`, { headers })
        .then(r => r.status === 204 ? { _embedded: { users: [] } } : r.json())
        .catch(() => ({ _embedded: { users: [] } })),
      // Notes counts (batch endpoints)
      getNotesCount(baseUrl, headers, "contacts"),
      getNotesCount(baseUrl, headers, "leads"),
      // Custom fields counts
      getCustomFieldsCount(baseUrl, headers, "contacts"),
      getCustomFieldsCount(baseUrl, headers, "leads"),
      getCustomFieldsCount(baseUrl, headers, "companies"),
    ]);

    // Transform sample contacts
    const sampleContacts = (contactsSample._embedded?.contacts || []).slice(0, 10).map((contact: any) => {
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
    const sampleLeads = (leadsSample._embedded?.leads || []).slice(0, 10).map((lead: any) => ({
      kommo_id: lead.id,
      kommo_name: lead.name,
      kommo_price: lead.price,
      kommo_pipeline_id: lead.pipeline_id,
      kommo_status_id: lead.status_id,
      crm_title: lead.name,
      crm_amount: lead.price || 0,
      contact_name: lead._embedded?.contacts?.[0]?.name || null,
    }));

    // Transform users list
    const kommoUsers = (usersResponse._embedded?.users || []).map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      is_active: user.rights?.is_active ?? true,
    }));

    // Total notes = contacts notes + leads notes
    const totalNotesCount = contactNotesCount.count + leadNotesCount.count;
    const hasMoreNotes = contactNotesCount.hasMore || leadNotesCount.hasMore;

    // Total custom fields
    const totalCustomFields = contactCustomFields + leadCustomFields + companyCustomFields;

    return new Response(
      JSON.stringify({
        // Contacts
        total_contacts: contactsCount.hasMore ? `${contactsCount.count}+` : contactsCount.count,
        total_contacts_number: contactsCount.count,
        has_more_contacts: contactsCount.hasMore,
        sample_contacts: sampleContacts,
        // Leads
        total_leads: leadsCount.hasMore ? `${leadsCount.count}+` : leadsCount.count,
        total_leads_number: leadsCount.count,
        has_more_leads: leadsCount.hasMore,
        sample_leads: sampleLeads,
        // Companies
        total_companies: companiesCount.hasMore ? `${companiesCount.count}+` : companiesCount.count,
        total_companies_number: companiesCount.count,
        has_more_companies: companiesCount.hasMore,
        // Tasks
        total_tasks: tasksCount.hasMore ? `${tasksCount.count}+` : tasksCount.count,
        total_tasks_number: tasksCount.count,
        has_more_tasks: tasksCount.hasMore,
        // Users
        total_users: kommoUsers.length,
        kommo_users: kommoUsers,
        // Notes
        total_notes: hasMoreNotes ? `${totalNotesCount}+` : totalNotesCount,
        total_notes_number: totalNotesCount,
        total_notes_contacts: contactNotesCount.count,
        total_notes_leads: leadNotesCount.count,
        has_more_notes: hasMoreNotes,
        // Custom Fields
        total_custom_fields: totalCustomFields,
        custom_fields_contacts: contactCustomFields,
        custom_fields_leads: leadCustomFields,
        custom_fields_companies: companyCustomFields,
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
