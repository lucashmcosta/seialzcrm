import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        JSON.stringify({ valid: false, error: "Subdomínio e access token são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate credentials by calling Kommo API
    const kommoUrl = `https://${subdomain}.kommo.com/api/v4/account`;
    
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
      
      if (kommoResponse.status === 401) {
        return new Response(
          JSON.stringify({ valid: false, error: "Access token inválido ou expirado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (kommoResponse.status === 404) {
        return new Response(
          JSON.stringify({ valid: false, error: "Subdomínio não encontrado. Verifique se está correto." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ valid: false, error: `Erro ao conectar: ${kommoResponse.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountData = await kommoResponse.json();

    return new Response(
      JSON.stringify({
        valid: true,
        account_name: accountData.name || accountData.subdomain || subdomain,
        account_id: accountData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error validating Kommo credentials:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Erro interno ao validar credenciais" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
