// Worker da fila de avisos ao cliente (nammux_notices). Roda a cada minuto pelo
// pg_cron. Para cada aviso vencido: confere o estado de agora, escolhe o canal
// (aplicativo; senão WhatsApp) e registra o desfecho.
//
// A lógica de decisão está em _shared/integrations/nammux-notice-core.ts (sem
// banco nem rede, testada caso a caso). Aqui fica só a entrada e saída.
//
// Autenticação: igualdade exata com a chave interna (internal-auth.ts).
// verify_jwt = false no config.toml: o agendador não manda JWT de usuário.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { dispatchWhatsAppSend } from "../_shared/dispatch-whatsapp-send.ts";
import { signHeaders } from "../_shared/client-portal/hmac.ts";
import { isInternalCaller } from "../_shared/integrations/internal-auth.ts";
import {
  classifySend,
  type ContactInfo,
  type FinishOutcome,
  type NoticeDeps,
  type NoticeRow,
  processNotice,
  type PushOutcome,
  type WhatsAppRoute,
} from "../_shared/integrations/nammux-notice-core.ts";
import {
  type NoticeKind,
  type Rendered,
  renderEventNotice,
  renderFinanceNotice,
  renderInterviewNotice,
  renderMovementNotice,
  type RenderResult,
} from "../_shared/integrations/nammux-notice-texts.ts";

const BATCH = 25;
const MAX_BATCHES = 4;
const MAX_RUNTIME_MS = 25_000;
const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Folga: uma janela que fecha em menos de 5 min é tratada como fechada. */
const WINDOW_MARGIN_MS = 5 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
function buildDeps(supabase: any, sendStarted: { value: boolean }): NoticeDeps {
  return {
    now: () => new Date(),

    async loadContact(notice): Promise<ContactInfo> {
      const { data } = await supabase.from("contacts")
        .select("id, do_not_contact, phone, deleted_at")
        .eq("id", notice.contact_id).eq("organization_id", notice.organization_id).maybeSingle();
      return {
        exists: !!data && !data.deleted_at,
        doNotContact: data?.do_not_contact === true,
        hasPhone: typeof data?.phone === "string" && data.phone.replace(/\D/g, "").length >= 10,
      };
    },

    async render(notice): Promise<RenderResult> {
      const kind = notice.kind as NoticeKind;
      const org = notice.organization_id;
      if (notice.subject_type === "event") {
        const { data } = await supabase.from("nammux_process_events")
          .select("event_type, status, start_at, all_day, timezone, modality, location, virtual_link, removed_at")
          .eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
        return data ? renderEventNotice(kind, data, notice.subject_start_at) : { ok: false, reason: "subject_gone" };
      }
      if (notice.subject_type === "finance") {
        const { data } = await supabase.from("nammux_process_finance")
          .select("kind, status, number, installments_count, effective_due_date, due_date, paid_on, manifestation_due_date, homologated_on, amount, reversed, parent_external_id")
          .eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
        if (!data) return { ok: false, reason: "subject_gone" };
        // "Parcela 2 de 6": o total está no acordo.
        if (data.kind === "installment" && data.parent_external_id) {
          const { data: agreement } = await supabase.from("nammux_process_finance")
            .select("installments_count")
            .eq("organization_id", org).eq("kind", "agreement").eq("external_id", data.parent_external_id).maybeSingle();
          data.installments_count = agreement?.installments_count ?? null;
        }
        return renderFinanceNotice(kind, data);
      }
      if (notice.subject_type === "movement") {
        const { data } = await supabase.from("nammux_process_movements")
          .select("text").eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
        return data ? renderMovementNotice(kind, data) : { ok: false, reason: "subject_gone" };
      }
      if (notice.subject_type === "interview_request") {
        const { data } = await supabase.from("nammux_interview_requests")
          .select("status, requested_start_at").eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
        return data ? renderInterviewNotice(kind, data) : { ok: false, reason: "subject_gone" };
      }
      return { ok: false, reason: "kind_mismatch" };
    },

    // Notificação no aplicativo do cliente. O backend do App precisa expor a
    // operação (CLIENT_PORTAL_NOTIFY_URL); enquanto não houver, tudo segue por WhatsApp.
    async sendPush(notice, rendered: Rendered): Promise<PushOutcome> {
      const url = Deno.env.get("CLIENT_PORTAL_NOTIFY_URL");
      const secret = Deno.env.get("CLIENT_PORTAL_HMAC_SECRET");
      const portalOrg = Deno.env.get("CLIENT_PORTAL_ORGANIZATION_ID");
      if (!url || !secret || !portalOrg || portalOrg !== notice.organization_id) return "not_configured";
      const raw = JSON.stringify({
        organizationId: notice.organization_id,
        seialzContactId: notice.contact_id,
        // Idempotência do lado do App: o mesmo aviso nunca notifica duas vezes.
        clientNotificationId: notice.id,
        title: rendered.title,
        body: rendered.text,
      });
      sendStarted.value = true;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await signHeaders(secret, raw, Math.floor(Date.now() / 1000))) },
          body: raw,
          signal: AbortSignal.timeout(8_000),
        });
        const out = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (res.ok && out.delivered === true) return "delivered";
        if (out.code === "no_device" || res.status === 404) return "no_device";
        if (res.status >= 400 && res.status < 500) return "failed";
        return "unknown";
      } catch {
        return "unknown";
      }
    },

    async whatsappRoute(notice): Promise<WhatsAppRoute | null> {
      const org = notice.organization_id;
      // O número da linha de Atendimento da organização.
      const { data: line } = await supabase.from("messaging_lines")
        .select("active_endpoint_id")
        .eq("organization_id", org).eq("key", "customer_service").eq("channel", "whatsapp").maybeSingle();
      if (!line?.active_endpoint_id) return null;
      const { data: endpoint } = await supabase.from("communication_endpoints")
        .select("id, is_active, provider").eq("id", line.active_endpoint_id).eq("organization_id", org).maybeSingle();
      if (!endpoint?.is_active) return null;

      const { data: mapped } = await supabase.from("nammux_notice_templates")
        .select("whatsapp_template_id, whatsapp_templates!inner(id, status, is_active)")
        .eq("organization_id", org).eq("kind", notice.kind).maybeSingle();
      const tpl = mapped?.whatsapp_templates as { status?: string; is_active?: boolean } | undefined;
      const templateId = tpl?.status === "approved" && tpl?.is_active !== false ? mapped.whatsapp_template_id as string : null;

      const { data: thread } = await supabase.from("message_threads")
        .select("whatsapp_last_inbound_at")
        .eq("organization_id", org).eq("contact_id", notice.contact_id).eq("channel", "whatsapp")
        .not("whatsapp_last_inbound_at", "is", null)
        .order("whatsapp_last_inbound_at", { ascending: false }).limit(1).maybeSingle();
      const last = thread?.whatsapp_last_inbound_at ? new Date(thread.whatsapp_last_inbound_at).getTime() : 0;
      const windowOpen = last > 0 && Date.now() - last < WINDOW_MS - WINDOW_MARGIN_MS;

      return { endpointId: endpoint.id, provider: endpoint.provider ?? "twilio", windowOpen, templateId };
    },

    async sendWhatsApp(notice, route, mode, rendered) {
      const variables: Record<string, string> = {};
      rendered.variables.forEach((v, i) => { variables[String(i + 1)] = v; });
      sendStarted.value = true;
      const result = await dispatchWhatsAppSend({
        organizationId: notice.organization_id,
        contactId: notice.contact_id,
        // Número de Atendimento, explícito. Sem threadId e com senderContext "inbox":
        // este envio nunca passa pelo desvio do número comercial.
        endpointId: route.endpointId,
        senderContext: "inbox",
        senderName: "Aviso automático",
        ...(mode === "template"
          ? { templateId: route.templateId!, templateVariables: variables }
          : { message: rendered.text }),
      }, { supabase });
      return classifySend(result);
    },

    async finish(notice, outcome: FinishOutcome, reason, channel, messageId) {
      const { error } = await supabase.rpc("nammux_notice_finish", {
        _notice_id: notice.id,
        _outcome: outcome,
        _reason: reason ?? null,
        _channel: channel ?? null,
        _message_id: messageId ?? null,
      });
      // Sem o desfecho gravado o aviso fica em `sending` e o recuperador o manda para revisão.
      if (error) console.error("[nammux-notice-dispatch] desfecho não gravado", notice.id, error.code ?? "sem_codigo");
    },
  };
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  if (!(await isInternalCaller(req, supabase))) return json({ error: "unauthorized" }, 401);

  const startedAt = Date.now();
  const summary: Record<string, number> = {};
  const count = (k: string) => { summary[k] = (summary[k] ?? 0) + 1; };

  const { data: reaped, error: reapError } = await supabase.rpc("nammux_notice_reap");
  if (reapError) console.error("[nammux-notice-dispatch] recuperador", reapError.code ?? "sem_codigo");

  for (let batch = 0; batch < MAX_BATCHES && Date.now() - startedAt < MAX_RUNTIME_MS; batch++) {
    const { data: claimed, error: claimError } = await supabase.rpc("nammux_claim_notices", { _limit: BATCH });
    if (claimError) {
      console.error("[nammux-notice-dispatch] reivindicação", claimError.code ?? "sem_codigo");
      break;
    }
    const notices = (claimed ?? []) as NoticeRow[];
    if (!notices.length) break;

    for (const notice of notices) {
      // Passou do tempo da execução: o que sobrou fica em `sending` sem envio iniciado.
      // Devolve para a fila com espera, em vez de deixar para o recuperador (que mandaria para revisão).
      const sendStarted = { value: false };
      const deps = buildDeps(supabase, sendStarted);
      if (Date.now() - startedAt >= MAX_RUNTIME_MS) {
        await deps.finish(notice, "retry", "worker_timeout");
        count("deferred");
        continue;
      }
      try {
        count((await processNotice(notice, deps)).split(":")[0]);
      } catch (e) {
        // Erro antes de qualquer envio: nada saiu, pode tentar de novo.
        // Erro depois de o envio começar: não se sabe se saiu. Vai para uma pessoa.
        console.error("[nammux-notice-dispatch] erro", notice.id, notice.kind, (e as Error).name);
        await deps.finish(notice, sendStarted.value ? "needs_review" : "retry",
          sendStarted.value ? "unknown_outcome" : "internal_error");
        count(sendStarted.value ? "needs_review" : "retry");
      }
    }
  }

  // Sem identificador de contato, telefone ou texto de aviso no log: só contagens.
  console.log("[nammux-notice-dispatch]", JSON.stringify({ reaped: reaped ?? null, ...summary, ms: Date.now() - startedAt }));
  return json({ ok: true, reaped: reaped ?? null, summary });
});
