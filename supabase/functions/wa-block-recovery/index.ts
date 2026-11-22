// Rotina (a cada 10 min): retoma as conversas que ficaram sem resposta durante um bloqueio de
// envio do WhatsApp. Só roda para integrações com config_values.block_recovery.status = pending
// (gravado pelo webhook quando a Meta volta a aceitar mensagens).
// Uma vez por conversa (wa_block_recovery_items, único por conversa + bloqueio):
//  - janela de 24 h aberta e conversa com o agente → o agente responde lendo tudo;
//  - janela fechada → template de retomada do agente (block_recovery_template_id), poucos por
//    execução e só entre 8h e 20h, para não pesar na qualidade do número logo após a liberação;
//  - conversa com uma pessoa da equipe, contato "não contatar" ou conversa encerrada → não envia.
// Se o número voltar a ser bloqueado, para e espera a próxima liberação.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyServiceRoleAuth } from "../_shared/auth.ts";
import { dispatchWhatsAppSend } from "../_shared/dispatch-whatsapp-send.ts";
import {
  AGENT_REPLIES_PER_RUN, TEMPLATES_PER_RUN, decideRecovery, withinSendingHours,
} from "../_shared/meta-whatsapp/block-recovery.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const auth = await verifyServiceRoleAuth(req);
  if (!auth.ok) return json({ error: "unauthorized", reason: auth.error }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Mesma credencial interna que chamou esta rotina, repassada ao agente (como agent-followups).
  const forwardAuth = req.headers.get("authorization") ?? "";
  const result = { integrations: 0, queued: 0, agent_replied: 0, template_sent: 0, skipped: 0, failed: 0 };

  const { data: rows, error } = await supabase.from("organization_integrations")
    .select("id, organization_id, config_values")
    .eq("is_enabled", true)
    .eq("config_values->block_recovery->>status", "pending");
  if (error) return json({ error: error.message }, 500);

  for (const oi of rows ?? []) {
    const cv = (oi.config_values ?? {}) as Record<string, any>;
    if (cv.send_block) continue; // bloqueado de novo: espera a próxima liberação
    const rec = cv.block_recovery as { block_since: string; unblocked_at: string };
    if (!rec?.block_since || !rec?.unblocked_at) continue;
    result.integrations++;

    // 1. Enfileira as conversas afetadas (idempotente: único por conversa + bloqueio).
    const { data: cands, error: candError } = await supabase.rpc("fn_wa_block_recovery_candidates", {
      p_oi: oi.id, p_since: rec.block_since, p_until: rec.unblocked_at,
    });
    if (candError) { console.error("[wa-block-recovery] candidatos", oi.id, candError.message); continue; }
    const items = (cands ?? []).map((c: any) => ({
      organization_id: c.organization_id, organization_integration_id: oi.id, thread_id: c.thread_id,
      contact_id: c.contact_id, agent_id: c.agent_id, block_since: rec.block_since, last_inbound_at: c.last_in,
    }));
    if (items.length) {
      const { data: inserted } = await supabase.from("wa_block_recovery_items")
        .upsert(items, { onConflict: "thread_id,block_since", ignoreDuplicates: true }).select("id");
      result.queued += inserted?.length ?? 0;
    }

    // 2. Processa as pendentes, com limite por execução.
    const { data: pending } = await supabase.from("wa_block_recovery_items")
      .select("id, thread_id, contact_id, agent_id, last_inbound_at")
      .eq("organization_integration_id", oi.id).eq("block_since", rec.block_since).eq("status", "pending")
      .order("last_inbound_at", { ascending: false }).limit(50);
    let templates = 0;
    let replies = 0;

    for (const item of pending ?? []) {
      const finish = (status: string, resultText: string | null = null) =>
        supabase.from("wa_block_recovery_items").update({ status, result: resultText, processed_at: new Date().toISOString() })
          .eq("id", item.id).eq("status", "pending");

      // Estado atual da conversa (pode ter mudado desde o enfileiramento).
      const [{ data: candRow }, { data: contact }] = await Promise.all([
        supabase.rpc("fn_wa_block_recovery_candidates", { p_oi: oi.id, p_since: rec.block_since, p_until: new Date().toISOString() })
          .eq("thread_id", item.thread_id).maybeSingle(),
        supabase.from("contacts").select("do_not_contact, deleted_at").eq("id", item.contact_id).maybeSingle(),
      ]);
      const cand = candRow as { agent_id: string | null; with_agent: boolean; thread_status: string | null; last_in: string | null } | null;
      if (!cand) { await finish("skipped_answered"); result.skipped++; continue; }

      const { data: agent } = cand.agent_id
        ? await supabase.from("ai_agents").select("id, is_enabled, block_recovery_template_id, working_hours").eq("id", cand.agent_id).maybeSingle()
        : { data: null };
      const action = decideRecovery({
        withAgent: !!cand.with_agent && !!agent?.is_enabled,
        threadStatus: cand.thread_status,
        lastInboundAt: cand.last_in,
        doNotContact: !contact || !!contact.deleted_at || !!contact.do_not_contact,
        hasTemplate: !!agent?.block_recovery_template_id,
      });

      try {
        if (action === "agent_reply") {
          if (replies >= AGENT_REPLIES_PER_RUN) continue;
          replies++;
          const { data: last } = await supabase.from("messages").select("content")
            .eq("thread_id", item.thread_id).eq("direction", "inbound").is("deleted_at", null)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          // A chamada que rodou durante o bloqueio marcou esta mensagem como já respondida.
          await supabase.from("message_threads").update({ ai_agent_reply_claim_message_id: null }).eq("id", item.thread_id);
          const res = await fetch(`${url}/functions/v1/ai-agent-respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: forwardAuth },
            body: JSON.stringify({ agentId: cand.agent_id, contactId: item.contact_id, threadId: item.thread_id, message: last?.content ?? "" }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(`agent_http_${res.status}`);
          await finish("agent_replied", (body as { status?: string }).status ?? null);
          result.agent_replied++;
        } else if (action === "template") {
          const tz = (agent?.working_hours as { timezone?: string } | null)?.timezone ?? "America/Sao_Paulo";
          if (templates >= TEMPLATES_PER_RUN || !withinSendingHours(new Date(), tz)) continue;
          // Template ainda em análise na Meta: espera a aprovação (a conversa continua na fila).
          const { data: tpl } = await supabase.from("whatsapp_templates").select("status")
            .eq("id", agent!.block_recovery_template_id).maybeSingle();
          if (tpl?.status !== "approved") continue;
          templates++;
          const { data: sendData, error: sendError } = await dispatchWhatsAppSend({
            organizationId: oi.organization_id, contactId: item.contact_id, threadId: item.thread_id,
            templateId: agent!.block_recovery_template_id, templateVariables: {}, senderContext: "block_recovery",
          });
          const err = sendError?.message ?? ((sendData as { error?: unknown } | null)?.error ? String((sendData as { error?: unknown }).error) : null);
          if (err) throw new Error(err);
          await finish("template_sent");
          result.template_sent++;
        } else {
          await finish(action);
          result.skipped++;
        }
      } catch (e) {
        await finish("failed", (e as Error).message.slice(0, 300));
        result.failed++;
      }
    }

    // 3. Nada pendente: recuperação concluída.
    const { count: left } = await supabase.from("wa_block_recovery_items").select("id", { count: "exact", head: true })
      .eq("organization_integration_id", oi.id).eq("block_since", rec.block_since).eq("status", "pending");
    if ((left ?? 0) === 0) {
      const { data: fresh } = await supabase.from("organization_integrations").select("config_values").eq("id", oi.id).maybeSingle();
      const base = (fresh?.config_values ?? cv) as Record<string, any>;
      if (base.block_recovery?.block_since === rec.block_since) {
        await supabase.from("organization_integrations").update({
          config_values: { ...base, block_recovery: { ...base.block_recovery, status: "done", done_at: new Date().toISOString() } },
        }).eq("id", oi.id);
      }
    }
  }

  console.log("[wa-block-recovery]", result);
  return json({ ok: true, ...result });
});
