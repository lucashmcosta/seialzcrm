// Aba do processo na oportunidade: próximas datas e linha do tempo, consultadas
// na hora no Nammux (`seialz-process-info`). O Seialz não guarda cópia.
//
// JWT do usuário obrigatório. Só responde se o usuário enxerga a oportunidade
// (leitura com a identidade dele, sob RLS). A chamada ao Nammux é assinada com o
// segredo da integração, que não pode ir ao navegador.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { nammuxSignedPost } from "../_shared/integrations/nammux-client.ts";
import { PROCESS_INFO_FUNCTION } from "../_shared/integrations/nammux-process-info.ts";
import { parseViewRequest, viewResponse } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { code: "method_not_allowed" });

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { code: "unauthorized" });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { code: "unauthorized" });

  const parsed = parseViewRequest(await req.json().catch(() => null));
  if (!parsed) return json(400, { code: "invalid_params" });

  // Enxerga a oportunidade? A RLS decide, com a identidade de quem chamou.
  const { data: opp } = await userClient.from("opportunities").select("id")
    .eq("id", parsed.opportunityId).eq("organization_id", parsed.organizationId).maybeSingle();
  if (!opp) return json(403, { code: "forbidden" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const res = await nammuxSignedPost(admin, parsed.organizationId, PROCESS_INFO_FUNCTION, {
    seialz_opportunity_ids: [parsed.opportunityId],
    include: ["agenda", "timeline"],
  });
  if (!res.ok) return json(200, { available: false, agenda: [], timeline: [] });
  return json(200, viewResponse(res.data, parsed.opportunityId));
});
