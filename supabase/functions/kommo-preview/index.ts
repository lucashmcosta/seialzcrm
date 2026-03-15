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
    if (response.status === 204) return response;
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  throw new Error('Max retries exceeded');
}

// Get exact count by paginating through all pages
async function getExactCount(baseUrl: string, headers: Record<string, string>, endpoint: string, extraParams = ''): Promise<number> {
  let total = 0;
  let page = 1;

  while (true) {
    try {
      const sep = extraParams ? '&' : '';
      const response = await fetchWithRetry(
        `${baseUrl}/${endpoint}?limit=250&page=${page}${sep}${extraParams}`,
        { headers }
      );

      if (response.status === 204) break;

      const data = await response.json();
      const key = endpoint.split('/')[0];
      const items = data._embedded?.[key] || [];

      total += items.length;

      if (items.length < 250 || !data._links?.next) break;

      page++;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error(`Error fetching ${endpoint} page ${page}:`, err);
      break;
    }
  }

  return total;
}

// Get exact leads count filtered by pipeline_ids
async function getExactLeadsCountByPipelines(baseUrl: string, headers: Record<string, string>, pipelineIds: number[]): Promise<number> {
  // Build filter query params: filter[pipeline_id][]=id1&filter[pipeline_id][]=id2
  const filterParams = pipelineIds.map(id => `filter[pipeline_id][]=${id}`).join('&');
  return getExactCount(baseUrl, headers, 'leads', filterParams);
}

// Get exact notes count by paginating
async function getExactNotesCount(baseUrl: string, headers: Record<string, string>, entityType: string): Promise<number> {
  let total = 0;
  let page = 1;

  while (true) {
    try {
      const response = await fetchWithRetry(
        `${baseUrl}/${entityType}/notes?limit=250&page=${page}`,
        { headers }
      );

      if (response.status === 204) break;

      const data = await response.json();
      const items = data._embedded?.notes || [];

      total += items.length;

      if (items.length < 250 || !data._links?.next) break;

      page++;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error(`Error fetching ${entityType}/notes page ${page}:`, err);
      break;
    }
  }

  return total;
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

function extractUsersFromPayload(usersData: any): any[] {
  if (Array.isArray(usersData)) return usersData;
  if (Array.isArray(usersData?._embedded?.users)) return usersData._embedded.users;
  if (Array.isArray(usersData?.users)) return usersData.users;
  return [];
}

async function fetchKommoUsers(baseUrl: string, headers: Record<string, string>): Promise<any[]> {
  const usersUrl = `${baseUrl}/users`;
  console.log("Fetching users from:", usersUrl);

  try {
    let usersResponse: Response;
    try {
      usersResponse = await fetchWithRetry(`${usersUrl}?with=role`, { headers });
    } catch {
      console.warn("Users fetch with '?with=role' failed, retrying plain /users");
      usersResponse = await fetchWithRetry(usersUrl, { headers });
    }

    console.log("Users response status:", usersResponse.status);

    const usersData = usersResponse.status === 204
      ? { _embedded: { users: [] } }
      : await usersResponse.json();

    const parsedUsers = extractUsersFromPayload(usersData);
    console.log("Users parsed count:", parsedUsers.length);
    return parsedUsers;
  } catch (error) {
    console.error("Error fetching users list:", error);
    return [];
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

    const { subdomain: rawSubdomain, access_token, pipeline_ids } = await req.json();

    if (!rawSubdomain || !access_token) {
      return new Response(
        JSON.stringify({ error: "Subdomínio e access token são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subdomain = rawSubdomain
      .replace(/^https?:\/\//i, '')
      .replace(/\.kommo\.com.*$/i, '')
      .replace(/[\/\s]/g, '')
      .trim();

    if (!subdomain) {
      return new Response(
        JSON.stringify({ error: "Subdomínio inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sanitized subdomain for preview:", subdomain);

    const baseUrl = `https://${subdomain}.kommo.com/api/v4`;
    const headers = {
      "Authorization": `Bearer ${access_token}`,
      "Content-Type": "application/json",
    };

    // Phase 1: Fetch samples and users (fast)
    const [
      contactsSample,
      leadsSample,
      usersPayload,
      contactCustomFields,
      leadCustomFields,
      companyCustomFields,
    ] = await Promise.all([
      fetchWithRetry(`${baseUrl}/contacts?limit=10&with=leads`, { headers })
        .then(r => r.status === 204 ? { _embedded: { contacts: [] } } : r.json())
        .catch(() => ({ _embedded: { contacts: [] } })),
      fetchWithRetry(`${baseUrl}/leads?limit=10&with=contacts`, { headers })
        .then(r => r.status === 204 ? { _embedded: { leads: [] } } : r.json())
        .catch(() => ({ _embedded: { leads: [] } })),
      fetchKommoUsers(baseUrl, headers),
      getCustomFieldsCount(baseUrl, headers, "contacts"),
      getCustomFieldsCount(baseUrl, headers, "leads"),
      getCustomFieldsCount(baseUrl, headers, "companies"),
    ]);

    // Phase 2: Exact counts (paginated, slower)
    console.log("Starting exact counts...");
    const [
      contactsCount,
      leadsCount,
      companiesCount,
      tasksCount,
      contactNotesCount,
      leadNotesCount,
    ] = await Promise.all([
      getExactCount(baseUrl, headers, "contacts"),
      getExactCount(baseUrl, headers, "leads"),
      getExactCount(baseUrl, headers, "companies"),
      getExactCount(baseUrl, headers, "tasks"),
      getExactNotesCount(baseUrl, headers, "contacts"),
      getExactNotesCount(baseUrl, headers, "leads"),
    ]);
    console.log("Exact counts done:", { contactsCount, leadsCount, companiesCount, tasksCount, contactNotesCount, leadNotesCount });

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
    const kommoUsers = usersPayload.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      is_active: user.rights?.is_active ?? true,
    }));

    const totalNotesCount = contactNotesCount + leadNotesCount;
    const totalCustomFields = contactCustomFields + leadCustomFields + companyCustomFields;

    return new Response(
      JSON.stringify({
        total_contacts: contactsCount,
        total_leads: leadsCount,
        total_companies: companiesCount,
        total_tasks: tasksCount,
        total_users: kommoUsers.length,
        kommo_users: kommoUsers,
        total_notes: totalNotesCount,
        total_notes_contacts: contactNotesCount,
        total_notes_leads: leadNotesCount,
        total_custom_fields: totalCustomFields,
        custom_fields_contacts: contactCustomFields,
        custom_fields_leads: leadCustomFields,
        custom_fields_companies: companyCustomFields,
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
