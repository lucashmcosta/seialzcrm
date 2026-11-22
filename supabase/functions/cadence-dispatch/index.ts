// Robô das réguas (a cada minuto, chamado pelo pg_cron com a chave interna).
// 1. Reserva os envios vencidos (fn_cadence_claim_sends: cada envio uma vez só).
// 2. Decide cada um na hora (fn_cadence_prepare_send: não contatar, aceite, janela, limites, repetição).
// 3. Envia o template de WhatsApp pelo despachante (Twilio, Meta ou Evolution) ou cria a tarefa.
// 4. Registra o resultado (fn_cadence_finish_send), que conclui a inscrição quando não resta nada.
// Vale para todas as organizações; "pausar todas as réguas" da org é respeitado na reserva.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyServiceRoleAuth } from "../_shared/auth.ts";
import { dispatchWhatsAppSend } from "../_shared/dispatch-whatsapp-send.ts";
import { resolveCadenceVariables, type CadenceVariableContext } from "../_shared/cadence-variables.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Prepared {
  action: string;
  reason?: string;
  kind?: "whatsapp_template" | "task";
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
}

// deno-lint-ignore no-explicit-any
async function loadContext(supabase: any, p: Prepared): Promise<CadenceVariableContext> {
  const [contact, opportunity, owner, org, custom] = await Promise.all([
    supabase.from("contacts").select("full_name, first_name, email, phone").eq("id", p.contact_id).maybeSingle(),
    supabase.from("opportunities").select("title, amount, currency").eq("id", p.opportunity_id).maybeSingle(),
    p.owner_user_id
      ? supabase.from("users").select("full_name, first_name").eq("id", p.owner_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("organizations").select("name").eq("id", p.organization_id).maybeSingle(),
    supabase.from("custom_field_values")
      .select("record_id, value, custom_field_definitions:field_definition_id(name)")
      .eq("organization_id", p.organization_id)
      .in("record_id", [p.contact_id, p.opportunity_id]),
  ]);
  const customValues: Record<string, unknown> = {};
  // Contato primeiro, oportunidade por cima (o dado da venda vale mais).
  for (const pass of [p.contact_id, p.opportunity_id]) {
    for (const row of (custom.data ?? []) as Array<{ record_id: string; value: unknown; custom_field_definitions: { name: string } | null }>) {
      if (row.record_id === pass && row.custom_field_definitions?.name) customValues[row.custom_field_definitions.name.toLowerCase()] = row.value;
    }
  }
  return {
    contact: contact.data ?? {},
    opportunity: opportunity.data ?? {},
    owner: owner.data ?? null,
    org: org.data ?? {},
    custom: customValues,
  };
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

  if (result.claimed) console.log("[cadence-dispatch]", result);
  return json({ ok: true, ...result });
});
