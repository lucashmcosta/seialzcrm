// Robô das réguas (a cada minuto, chamado pelo pg_cron com a chave interna).
// 1. Reserva os envios vencidos (fn_cadence_claim_sends: cada envio uma vez só).
// 2. Decide cada um na hora (fn_cadence_prepare_send: não contatar, aceite, janela, limites, repetição).
// 3. Envia o template de WhatsApp pelo despachante (Twilio, Meta ou Evolution), o e-mail pela Resend
//    da própria org, ou cria a tarefa.
// 4. Registra o resultado (fn_cadence_finish_send), que conclui a inscrição quando não resta nada.
// Vale para todas as organizações; "pausar todas as réguas" da org é respeitado na reserva.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyServiceRoleAuth } from "../_shared/auth.ts";
import { dispatchWhatsAppSend } from "../_shared/dispatch-whatsapp-send.ts";
import { resolveCadenceVariables, type CadenceVariableContext } from "../_shared/cadence-variables.ts";
import { loadVariableContext, sendOrgEmail, type SendResult } from "../_shared/email-send-core.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Prepared {
  action: string;
  reason?: string;
  kind?: "whatsapp_template" | "task" | "email";
  organization_id?: string;
  contact_id?: string;
  opportunity_id?: string;
  owner_user_id?: string | null;
  assigned_user_id?: string | null;
  template_id?: string;
  template_variables?: Record<string, unknown>;
  endpoint_id?: string;
  thread_id?: string | null;
  task_title?: string;
  task_description?: string | null;
  task_due_minutes?: number;
  task_priority?: string;
  email_template_id?: string;
  to_email?: string;
  is_marketing?: boolean;
}

// deno-lint-ignore no-explicit-any
const loadContext = (supabase: any, p: Prepared) => loadVariableContext(supabase, {
  organization_id: p.organization_id!, contact_id: p.contact_id!, opportunity_id: p.opportunity_id ?? null, owner_user_id: p.owner_user_id ?? null,
});

/** Passo de e-mail: modelo da régua pela conta Resend da org. */
// deno-lint-ignore no-explicit-any
async function sendCadenceEmail(supabase: any, sendId: string, p: Prepared): Promise<SendResult> {
  const { data: tpl } = await supabase.from("email_templates").select("id, subject, body").eq("id", p.email_template_id).maybeSingle();
  if (!tpl) return { ok: false, status: "failed", reason: "modelo de e-mail removido" };
  return await sendOrgEmail(supabase, {
    organization_id: p.organization_id!, contact_id: p.contact_id!, opportunity_id: p.opportunity_id ?? null, owner_user_id: p.owner_user_id ?? null,
    to_email: p.to_email!, is_marketing: !!p.is_marketing, subject: tpl.subject, body: tpl.body, template_id: tpl.id,
    cadence_send_id: sendId, tag: p.is_marketing ? "cadence_marketing" : "cadence",
  });
}

serve(async (req) => {
  const auth = await verifyServiceRoleAuth(req);
  if (!auth.ok) return json({ error: "unauthorized", reason: auth.error }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const result = { claimed: 0, sent: 0, tasks: 0, skipped: 0, rescheduled: 0, cancelled: 0, failed: 0 };
  const finish = (id: string, status: "sent" | "failed" | "skipped", reason?: string | null, messageId?: string | null, taskId?: string | null) =>
    supabase.rpc("fn_cadence_finish_send", {
      p_send_id: id, p_status: status, p_reason: reason ?? null,
      p_message_id: messageId && UUID.test(messageId) ? messageId : null, p_task_id: taskId ?? null,
    });

  const { data: claimed, error: claimError } = await supabase.rpc("fn_cadence_claim_sends", { p_limit: 50 });
  if (claimError) {
    console.error("[cadence-dispatch] claim", claimError.message);
    return json({ ok: false, error: "claim_failed" }, 500);
  }

  for (const row of (claimed ?? []) as Array<{ send_id: string }>) {
    result.claimed++;
    const id = row.send_id;
    try {
      const { data: prepared, error: prepError } = await supabase.rpc("fn_cadence_prepare_send", { p_send_id: id });
      if (prepError) throw new Error(`prepare: ${prepError.message}`);
      const p = prepared as Prepared;
      if (p.action !== "send") {
        if (p.action === "rescheduled") result.rescheduled++;
        else if (p.action === "skipped") result.skipped++;
        else if (p.action === "cancelled") result.cancelled++;
        else if (p.action === "failed") result.failed++;
        continue;
      }

      if (p.kind === "task") {
        if (!p.assigned_user_id) { await finish(id, "failed", "oportunidade e contato sem responsável"); result.failed++; continue; }
        const { data: task, error: taskError } = await supabase.from("tasks").insert({
          organization_id: p.organization_id, contact_id: p.contact_id, opportunity_id: p.opportunity_id,
          assigned_user_id: p.assigned_user_id, title: String(p.task_title ?? "").slice(0, 200),
          description: p.task_description ?? null, task_type: "follow_up", status: "open",
          priority: p.task_priority ?? "medium",
          due_at: new Date(Date.now() + (p.task_due_minutes ?? 60) * 60_000).toISOString(),
        }).select("id").single();
        if (taskError) { await finish(id, "failed", `tarefa: ${taskError.message}`); result.failed++; continue; }
        await finish(id, "sent", null, null, task.id);
        result.tasks++;
        continue;
      }

      if (p.kind === "email") {
        const r = await sendCadenceEmail(supabase, id, p);
        if (r.ok) { await finish(id, "sent", null, r.emailId); result.sent++; }
        else { await finish(id, r.status, r.reason); if (r.status === "skipped") result.skipped++; else result.failed++; }
        continue;
      }

      const ctx = await loadContext(supabase, p);
      const vars = resolveCadenceVariables(p.template_variables as Record<string, unknown>, ctx);
      if (!vars.ok) {
        await finish(id, "skipped", `variável sem valor: ${vars.missing.join(", ")}`);
        result.skipped++;
        continue;
      }
      const { data: sendData, error: sendError } = await dispatchWhatsAppSend({
        organizationId: p.organization_id!, contactId: p.contact_id!, threadId: p.thread_id ?? undefined,
        endpointId: p.endpoint_id, templateId: p.template_id, templateVariables: vars.values,
        senderContext: "cadence",
      });
      const providerError = sendError?.message ?? (sendData && typeof sendData === "object" && (sendData as { error?: unknown }).error
        ? String((sendData as { error?: unknown }).error) : null);
      if (providerError) {
        await finish(id, "failed", `envio: ${providerError}`.slice(0, 300));
        result.failed++;
        continue;
      }
      await finish(id, "sent", null, (sendData as { messageId?: string } | null)?.messageId ?? null);
      result.sent++;
    } catch (e) {
      console.error("[cadence-dispatch] envio falhou", id, (e as Error).message);
      await finish(id, "failed", (e as Error).message.slice(0, 300));
      result.failed++;
    }
  }

  // Templates pedidos por botões do WhatsApp (ação "enviar template" das regras de botão).
  const buttons = { events: 0, sent: 0, failed: 0 };
  const { data: btnEvents, error: btnError } = await supabase.rpc("fn_button_claim_sends", { p_limit: 20 });
  if (btnError) console.error("[cadence-dispatch] button claim", btnError.message);
  for (const ev of (btnEvents ?? []) as Array<{ event_id: string; organization_id: string; contact_id: string; thread_id: string | null; opportunity_id: string | null; pending_sends: Array<{ template_id: string; variables: Record<string, unknown> }> }>) {
    buttons.events++;
    const out: Array<Record<string, unknown>> = [];
    let ok = true;
    try {
      const { data: contact } = await supabase.from("contacts").select("do_not_contact, deleted_at").eq("id", ev.contact_id).maybeSingle();
      if (!contact || contact.deleted_at || contact.do_not_contact) throw new Error("não contatar");
      const { data: opp } = ev.opportunity_id
        ? await supabase.from("opportunities").select("owner_user_id").eq("id", ev.opportunity_id).maybeSingle()
        : { data: null };
      const ctx = await loadContext(supabase, {
        action: "send", organization_id: ev.organization_id, contact_id: ev.contact_id,
        opportunity_id: ev.opportunity_id ?? undefined, owner_user_id: opp?.owner_user_id ?? null,
      });
      for (const s of ev.pending_sends ?? []) {
        const vars = resolveCadenceVariables(s.variables, ctx);
        if (!vars.ok) { ok = false; out.push({ template_id: s.template_id, error: `variável sem valor: ${vars.missing.join(", ")}` }); continue; }
        const { data: sendData, error: sendError } = await dispatchWhatsAppSend({
          organizationId: ev.organization_id, contactId: ev.contact_id, threadId: ev.thread_id ?? undefined,
          templateId: s.template_id, templateVariables: vars.values, senderContext: "button_rule",
        });
        const err = sendError?.message ?? ((sendData as { error?: unknown } | null)?.error ? String((sendData as { error?: unknown }).error) : null);
        if (err) { ok = false; out.push({ template_id: s.template_id, error: err.slice(0, 200) }); }
        else out.push({ template_id: s.template_id, ok: true, message_id: (sendData as { messageId?: string } | null)?.messageId ?? null });
      }
    } catch (e) {
      ok = false;
      out.push({ error: (e as Error).message.slice(0, 200) });
    }
    await supabase.rpc("fn_button_finish_sends", { p_event_id: ev.event_id, p_ok: ok, p_result: { sends: out } });
    if (ok) buttons.sent++; else buttons.failed++;
  }

  if (result.claimed || buttons.events) console.log("[cadence-dispatch]", result, { buttons });
  return json({ ok: true, ...result, buttons });
});
