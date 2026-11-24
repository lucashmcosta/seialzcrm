// Alerta de lead sumido: a regra mora no banco (intelligence_detect_ghosting_v1), que o cron chama direto
// de hora em hora. Esta função fica para rodar na mão (mesmo token do worker).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("intelligence_detect_ghosting_v1");
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, inserted: data ?? 0 });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
