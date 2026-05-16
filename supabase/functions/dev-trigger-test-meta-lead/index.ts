// TEMPORARY test endpoint: forces a synthetic Meta lead through process-lead
// Safe to delete after debug is done.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { organization_id, lead_form_id, lead_form_name, phone, full_name, settings } = body;

    const lead = {
      id: `test_${Date.now()}`,
      created_time: new Date().toISOString(),
      campaign_name: "TESTE MANUAL LOVABLE",
      ad_name: "Teste",
      field_data: [
        { name: "full_name", values: [full_name || "Teste Lovable"] },
        { name: "phone_number", values: [phone] },
      ],
    };

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-lead-ads-process-lead`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        lead,
        organization_id,
        lead_form_id,
        lead_form_name: lead_form_name || "Teste",
        settings,
      }),
    });
    const txt = await r.text();
    return new Response(
      JSON.stringify({ status: r.status, response: txt, sent_lead_id: lead.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
