// Rotina dos agentes de IA (a cada 10 min):
// 1. Retomada: quem parou de responder enquanto a conversa está com o agente recebe uma
//    retomada curta escrita pelo próprio agente (ai-agent-respond com followUp).
// 2. Mensagens que o agente agendou (scheduled_messages, created_by = 'agent').
// Tudo só dentro da janela de 24 h do WhatsApp e em conversas que continuam com o agente.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validateServiceRoleAuth } from "../_shared/auth.ts";
import { dispatchWhatsAppSend } from "../_shared/dispatch-whatsapp-send.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const auth = validateServiceRoleAuth(req);
  if (!auth.ok) return json({ error: "unauthorized", reason: auth.error }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey);
  const result = { followups: 0, followup_errors: 0, scheduled_sent: 0, scheduled_skipped: 0 };

  // 1. Retomadas
  const { data: due, error: claimError } = await supabase.rpc("fn_agent_followup_claim", { _limit: 20 });
  if (claimError) console.error("[agent-followups] claim", claimError.message);
  for (const row of (due ?? []) as Array<{ thread_id: string; contact_id: string; agent_id: string; attempt: number; total: number }>) {
    try {
      const res = await fetch(`${url}/functions/v1/ai-agent-respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          agentId: row.agent_id, contactId: row.contact_id, threadId: row.thread_id,
          message: "", followUp: { attempt: row.attempt, total: row.total },
        }),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      result.followups++;
    } catch (e) {
      result.followup_errors++;
      console.error("[agent-followups] retomada falhou", row.thread_id, (e as Error).message);
    }
  }

  // 2. Mensagens agendadas pelo agente (só as do último dia; as antigas ficam como estão)
  const { data: scheduled } = await supabase.from("scheduled_messages")
    .select("id, organization_id, contact_id, thread_id, content, ai_agent_id")
    .eq("status", "pending").eq("created_by", "agent")
    .lte("scheduled_at", new Date().toISOString())
    .gte("scheduled_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .limit(50);
  for (const msg of scheduled ?? []) {
    const { data: thread } = await supabase.from("message_threads")
      .select("ai_agent_id, ai_agent_released_at, assigned_user_id, ai_agents:ai_agent_id(name, is_enabled)")
      .eq("id", msg.thread_id).maybeSingle();
    const { data: lastIn } = await supabase.from("messages").select("sent_at")
      .eq("thread_id", msg.thread_id).eq("direction", "inbound").is("deleted_at", null)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle();
    const agent = (thread as { ai_agents?: { name: string; is_enabled: boolean } } | null)?.ai_agents;
    const withAgent = thread?.ai_agent_id && !thread.ai_agent_released_at && !thread.assigned_user_id && agent?.is_enabled;
    const inWindow = lastIn?.sent_at && Date.now() - new Date(lastIn.sent_at).getTime() < 23 * 3600 * 1000;
    if (!withAgent || !inWindow) {
      await supabase.from("scheduled_messages")
        .update({ status: "cancelled", error_message: !withAgent ? "conversa não está mais com o agente" : "fora da janela de 24 h" })
        .eq("id", msg.id);
      result.scheduled_skipped++;
      continue;
    }
    const { error } = await dispatchWhatsAppSend({
      organizationId: msg.organization_id, contactId: msg.contact_id, threadId: msg.thread_id,
      message: msg.content, isAgentMessage: true, agentId: thread!.ai_agent_id!, senderName: agent?.name,
    });
    await supabase.from("scheduled_messages")
      .update(error ? { status: "failed", error_message: error.message } : { status: "sent", sent_at: new Date().toISOString() })
      .eq("id", msg.id);
    if (!error) result.scheduled_sent++;
  }

  console.log("[agent-followups]", result);
  return json({ ok: true, ...result });
});
