// Decisão de envio de um aviso da fila nammux_notices: confere o estado na hora,
// escolhe o canal e traduz o resultado em desfecho. Sem banco e sem rede — tudo
// entra por `deps` — para ser testável caso a caso.
//
// Regra que mais importa: resultado INCERTO não é reenviado. Só volta para a
// fila o envio que o provedor recusou de forma definida. É isso que impede o
// cliente de receber o mesmo aviso duas vezes.
import type { Rendered, RenderResult } from "./nammux-notice-texts.ts";

export interface NoticeRow {
  id: string;
  organization_id: string;
  contact_id: string;
  kind: string;
  subject_type: string;
  subject_id: string;
  subject_start_at: string | null;
  expires_at: string | null;
  /** subject_type 'source_event': o estado do compromisso como o Nammux mandou na hora do pedido. */
  payload?: unknown;
}

export interface ContactInfo {
  exists: boolean;
  doNotContact: boolean;
  hasPhone: boolean;
}

export interface WhatsAppRoute {
  endpointId: string;
  /** meta_cloud_api | twilio | evolution_api */
  provider: string;
  /** A janela de 24 h de atendimento está aberta (o cliente escreveu há menos de 24 h). */
  windowOpen: boolean;
  /** Modelo aprovado mapeado para este tipo de aviso nesta organização. */
  templateId: string | null;
}

export type PushOutcome = "delivered" | "no_device" | "not_configured" | "failed" | "unknown";

export type SendOutcome =
  | { kind: "sent"; messageId: string | null }
  | { kind: "rejected"; code: string }
  | { kind: "unknown" };

export type FinishOutcome = "sent" | "retry" | "skipped" | "cancelled" | "expired" | "needs_review";

export interface NoticeDeps {
  now(): Date;
  loadContact(notice: NoticeRow): Promise<ContactInfo>;
  /** Carrega o estado atual do assunto e monta o texto. */
  render(notice: NoticeRow): Promise<RenderResult>;
  sendPush(notice: NoticeRow, rendered: Rendered): Promise<PushOutcome>;
  /** O modelo é o de `rendered.templateKey`, quando houver; senão, o do tipo do aviso. */
  whatsappRoute(notice: NoticeRow, rendered: Rendered): Promise<WhatsAppRoute | null>;
  sendWhatsApp(notice: NoticeRow, route: WhatsAppRoute, mode: "template" | "text", rendered: Rendered): Promise<SendOutcome>;
  finish(notice: NoticeRow, outcome: FinishOutcome, reason?: string | null, channel?: string | null, messageId?: string | null): Promise<void>;
}

/** Recusas que reenviar não resolve: é configuração do modelo, e alguém precisa ver. */
export const TEMPLATE_PROBLEMS = new Set([
  "template_not_approved",
  "template_purpose_mismatch",
  "template_waba_mismatch",
  "template_org_mismatch",
  "template_not_meta_cloud",
  "templates_not_supported_on_evolution",
]);
export const WINDOW_CLOSED = "conversation_window_closed";

/**
 * Resultado de dispatchWhatsAppSend em um dos três desfechos.
 *  - sem erro → enviado
 *  - o envio respondeu com um código de recusa → recusado (definido: nada saiu)
 *  - falha de rede, tempo esgotado ou erro 5xx sem código → INCERTO: a mensagem
 *    pode ter saído. Não se reenvia.
 */
export function classifySend(result: { data: unknown; error: { message?: string; name?: string; details?: unknown } | null }): SendOutcome {
  const data = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, unknown>;
  if (!result.error) {
    if (data.success === false) return { kind: "rejected", code: typeof data.error === "string" ? data.error : "send_failed" };
    return { kind: "sent", messageId: typeof data.messageId === "string" ? data.messageId : null };
  }
  const details = (result.error.details && typeof result.error.details === "object" ? result.error.details : {}) as Record<string, unknown>;
  if (typeof details.error === "string" && details.error) return { kind: "rejected", code: details.error };
  // Falha ao escolher o número (antes de qualquer envio).
  if (typeof result.error.name === "string" && result.error.name) return { kind: "rejected", code: result.error.name };
  if (/^HTTP 4\d\d$/.test(result.error.message ?? "")) return { kind: "rejected", code: "http_4xx" };
  return { kind: "unknown" };
}

/** Modelo ou texto livre? null = não há como enviar por WhatsApp agora. */
export function whatsappMode(route: WhatsAppRoute): "template" | "text" | null {
  // Evolution não tem janela nem modelo: sempre texto.
  if (route.provider === "evolution_api") return "text";
  if (route.windowOpen) return "text";
  return route.templateId ? "template" : null;
}

/** Processa um aviso já reivindicado (status `sending`). Devolve o desfecho, para o resumo do worker. */
export async function processNotice(notice: NoticeRow, deps: NoticeDeps): Promise<string> {
  const done = async (outcome: FinishOutcome, reason?: string | null, channel?: string | null, messageId?: string | null) => {
    await deps.finish(notice, outcome, reason ?? null, channel ?? null, messageId ?? null);
    return reason ? `${outcome}:${reason}` : outcome;
  };

  // 1. Passou do prazo (ex.: "está iniciando" pego 40 min depois): não envia.
  if (notice.expires_at && new Date(notice.expires_at).getTime() < deps.now().getTime()) {
    return await done("expired", "expired_before_send");
  }

  // 2. O contato existe e aceita ser contatado.
  const contact = await deps.loadContact(notice);
  if (!contact.exists) return await done("skipped", "contact_gone");
  if (contact.doNotContact) return await done("skipped", "do_not_contact");

  // 3. O estado de agora ainda corresponde ao aviso (mesma data, ainda pendente, ainda pago…).
  const rendered = await deps.render(notice);
  if (!rendered.ok) {
    const gone = rendered.reason === "subject_gone" || rendered.reason === "subject_changed";
    return await done(gone ? "cancelled" : "skipped", rendered.reason);
  }

  // 4. Aplicativo primeiro. "Sem aparelho", "não configurado" e falha definida seguem para o WhatsApp.
  const push = await deps.sendPush(notice, rendered.rendered);
  if (push === "delivered") return await done("sent", null, "app_push");
  if (push === "unknown") return await done("needs_review", "unknown_outcome", "app_push");

  // 5. WhatsApp.
  if (!contact.hasPhone) return await done("skipped", "no_phone");
  const route = await deps.whatsappRoute(notice, rendered.rendered);
  if (!route) return await done("skipped", "no_channel");
  let mode = whatsappMode(route);
  if (!mode) return await done("skipped", "no_template");

  let sent = await deps.sendWhatsApp(notice, route, mode, rendered.rendered);
  // A janela fechou entre a consulta e o envio: o texto foi recusado (nada saiu) e há modelo.
  if (sent.kind === "rejected" && sent.code === WINDOW_CLOSED && mode === "text" && route.templateId) {
    mode = "template";
    sent = await deps.sendWhatsApp(notice, route, mode, rendered.rendered);
  }
  const channel = mode === "template" ? "whatsapp_template" : "whatsapp_text";

  if (sent.kind === "sent") return await done("sent", null, channel, sent.messageId);
  if (sent.kind === "unknown") return await done("needs_review", "unknown_outcome", channel);
  if (sent.code === WINDOW_CLOSED) return await done("skipped", "no_template", channel);
  if (TEMPLATE_PROBLEMS.has(sent.code)) return await done("skipped", `template_problem:${sent.code}`, channel);
  return await done("retry", sent.code, channel);
}
