

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { subdomain: rawSubdomain, access_token } = await req.json();

    if (!rawSubdomain || !access_token) {
      return new Response(
        JSON.stringify({ error: "Subdomínio e access token são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize subdomain: remove protocol, .kommo.com suffix, trailing slashes
    const subdomain = rawSubdomain
      .replace(/^https?:\/\//i, '')
      .replace(/\.kommo\.com.*$/i, '')
      .replace(/[\/\s]/g, '')
      .trim();

    console.log("Sanitized subdomain:", subdomain);

    // Fetch pipelines from Kommo API
    const kommoUrl = `https://${subdomain}.kommo.com/api/v4/leads/pipelines`;
    
    const kommoResponse = await fetch(kommoUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!kommoResponse.ok) {
      const errorText = await kommoResponse.text();
      console.error("Kommo API error:", kommoResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Erro ao buscar pipelines: ${kommoResponse.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await kommoResponse.json();
    
    // Transform Kommo pipeline structure to our format
    const pipelines = data._embedded?.pipelines?.map((pipeline: any) => ({
      id: pipeline.id,
      name: pipeline.name,
      stages: pipeline._embedded?.statuses?.map((status: any) => ({
        id: status.id,
        name: status.name,
        sort: status.sort,
        color: status.color,
        type: status.type,
      })) || [],
    })) || [];

    // Fetch users in parallel so they're available for Step 3
    let users: any[] = [];
    try {
      const usersUrl = `https://${subdomain}.kommo.com/api/v4/users`;
      console.log("Fetching Kommo users from:", usersUrl);
      const usersResponse = await fetch(usersUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      });
      console.log("Users response status:", usersResponse.status);
      if (usersResponse.ok && usersResponse.status !== 204) {
        const usersData = await usersResponse.json();
        console.log("Users data keys:", Object.keys(usersData));
        users = usersData?._embedded?.users
          || usersData?.users
          || (Array.isArray(usersData) ? usersData : []);
        console.log("Parsed users count:", users.length);
      }
    } catch (usersErr) {
      console.error("Error fetching Kommo users (non-blocking):", usersErr);
    }

    return new Response(
      JSON.stringify({ pipelines, users }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching Kommo pipelines:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao buscar pipelines" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
