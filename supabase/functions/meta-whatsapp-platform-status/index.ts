// Retorna o estado dos secrets globais Meta WhatsApp Cloud.
// Endpoint público (verify_jwt=false), retorna apenas booleans — nenhum valor de secret trafega.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getPlatformStatus } from "../_shared/meta-whatsapp/platform.ts";

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(JSON.stringify(getPlatformStatus()), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
