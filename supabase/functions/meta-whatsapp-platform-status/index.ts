// Retorna o estado dos secrets globais Meta WhatsApp Cloud.
// build: 2026-06-26T22:00 (bump para recarregar env após criação dos secrets globais)
// Endpoint público (verify_jwt=false), retorna apenas booleans — nenhum valor de secret trafega.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getPlatformStatus } from "../_shared/meta-whatsapp/platform.ts";

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // DEBUG TEMP: lista env keys que contenham META para diagnóstico
  try {
    const envKeys = Object.keys(Deno.env.toObject()).filter((k) => k.includes("META"));
    console.log("[platform-status] meta env keys:", envKeys);
  } catch (e) {
    console.log("[platform-status] env list err", (e as Error).message);
  }
  return new Response(JSON.stringify(getPlatformStatus()), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
