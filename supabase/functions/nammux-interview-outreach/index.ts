// Convite automático para marcar a entrevista (dias úteis, 09:05, pg_cron).
//
// Para cada organização com a flag `nammux_interview_outreach`:
//   1. consulta a agenda de entrevistas no Nammux (horários livres);
//   2. calcula quantos processos novos convidar hoje (nammux-interview-outreach-quota.ts);
//   3. chama nammux_interview_outreach_plan, que agenda os lembretes de quem já foi
//      convidado e os convites novos na fila nammux_notices. Quem envia é o worker
//      nammux-notice-dispatch, que confere na hora se o processo ainda espera.
//
// Autenticação: chave interna (internal-auth.ts). verify_jwt = false no config.toml.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isInternalCaller } from "../_shared/integrations/internal-auth.ts";
import { nammuxSignedPost } from "../_shared/integrations/nammux-client.ts";
import { parseSlots } from "../_shared/integrations/nammux-agent-tools.ts";
import { countSlotsWithin, outreachQuota } from "../_shared/integrations/nammux-interview-outreach-quota.ts";

const FLAG = "nammux_interview_outreach";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!(await isInternalCaller(req, supabase))) return json({ error: "unauthorized" }, 401);

  const { data: flags, error: flagError } = await supabase.from("integration_feature_flags")
    .select("organization_id").eq("flag_key", FLAG).eq("enabled", true).not("organization_id", "is", null);
  if (flagError) return json({ error: "flag_lookup_failed" }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const { organization_id: org } of (flags ?? []) as Array<{ organization_id: string }>) {
    try {
      const { data: stats } = await supabase.rpc("nammux_interview_outreach_stats", { _organization_id: org });
      const s = (stats ?? {}) as { pending?: number; invited?: number; converted?: number; sample_opportunity?: string | null };
      let freeSlots = 0;
      let agenda = "sem_processo";
      if (s.sample_opportunity) {
        const res = await nammuxSignedPost(supabase, org, "seialz-interview-slots", { seialz_opportunity_id: s.sample_opportunity });
        const parsed = res.ok ? parseSlots(res.data) : null;
        agenda = !parsed ? "falha" : parsed.enabled ? "ok" : "fechada";
        if (parsed?.enabled) freeSlots = countSlotsWithin(parsed.slots, new Date());
      }
      const { quota, rate } = outreachQuota({
        freeSlots, pending: s.pending ?? 0, invited: s.invited ?? 0, converted: s.converted ?? 0,
      });
      const { data: plan, error: planError } = await supabase.rpc("nammux_interview_outreach_plan", {
        _organization_id: org, _new_quota: quota,
      });
      if (planError) throw new Error(planError.code ?? "plan_failed");
      const out = { org, agenda, freeSlots, pending: s.pending ?? 0, rate, quota, ...(plan as Record<string, unknown>) };
      console.log("[nammux-interview-outreach]", JSON.stringify(out));
      results.push(out);
    } catch (e) {
      console.error("[nammux-interview-outreach] erro", org, (e as Error).message);
      results.push({ org, error: (e as Error).message });
    }
  }
  return json({ ok: true, results });
});
