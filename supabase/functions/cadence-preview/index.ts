// Prévia da régua no editor: cada passo (rascunho, ainda não salvo) preenchido com uma oportunidade de exemplo,
// e se a condição do passo bateria agora. Não envia nada.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveCadenceVariables } from "../_shared/cadence-variables.ts";
import { fillEmail, loadVariableContext } from "../_shared/email-send-core.ts";
import { opportunityForCaller } from "../_shared/user-org-access.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const orgId = String(body.organization_id ?? ""), oppId = String(body.opportunity_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(oppId)) return json({ error: "invalid_params" }, 400);
  const access = await opportunityForCaller(req, orgId, oppId);
  if (!access.ok) return json({ error: access.error }, access.status);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ctx = await loadVariableContext(admin, { organization_id: orgId, contact_id: access.opp.contact_id, opportunity_id: oppId, owner_user_id: access.opp.owner_user_id });

  const steps = (Array.isArray(body.steps) ? body.steps : []).slice(0, 30) as Array<Record<string, any>>;
  const out = [];
  for (const st of steps) {
    let conditionOk: boolean | null = null;
    if (st.condition?.field_definition_id) {
      const { data } = await admin.rpc("fn_cadence_condition_ok", { p_cond: st.condition, p_opp: oppId, p_contact: access.opp.contact_id });
      conditionOk = !!data;
    }
    if (st.kind === "whatsapp_template" && st.template_id) {
      const { data: t } = await admin.from("whatsapp_templates").select("body").eq("id", String(st.template_id)).eq("organization_id", orgId).maybeSingle();
      // Cada variável sozinha: mostra as preenchidas e marca só as vazias.
      const values: Record<string, string> = {};
      const missing: string[] = [];
      for (const [k, raw] of Object.entries((st.template_variables ?? {}) as Record<string, unknown>)) {
        const one = resolveCadenceVariables({ [k]: raw }, ctx);
        if (one.ok) values[k] = one.values[k]; else missing.push(k);
      }
      const text = String(t?.body ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => values[k] ?? `[${k} vazio]`);
      out.push({ kind: st.kind, text, missing, condition_ok: conditionOk });
    } else if (st.kind === "email" && st.email_template_id) {
      const { data: t } = await admin.from("email_templates").select("subject, body").eq("id", String(st.email_template_id)).eq("organization_id", orgId).maybeSingle();
      const f = t ? fillEmail(t.subject, t.body, ctx) : { subject: "", body: "", missing: ["modelo removido"] };
      out.push({ kind: st.kind, subject: f.subject, text: f.body, missing: f.missing, condition_ok: conditionOk });
    } else if (st.kind === "task") {
      out.push({ kind: st.kind, text: String(st.task_title ?? ""), missing: [], condition_ok: conditionOk });
    } else {
      out.push({ kind: st.kind, text: "", missing: ["passo incompleto"], condition_ok: conditionOk });
    }
  }
  return json({ ok: true, steps: out });
});
