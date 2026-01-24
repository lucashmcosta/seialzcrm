import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        type: status.type, // 0 = normal, 1 = success (won), 2 = failure (lost)
      })) || [],
    })) || [];

    return new Response(
      JSON.stringify({ pipelines }),
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
