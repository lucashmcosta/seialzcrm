// O que fazer com cada conversa que ficou sem resposta durante um bloqueio de envio.
// Sem dependências de Deno (testável).

/** Mensagem livre só até 22 h depois da última mensagem do cliente (margem na janela de 24 h). */
export const FREE_REPLY_WINDOW_MS = 22 * 3600 * 1000;
/** Templates por execução da rotina (a cada 10 min): espaça o envio para não pesar na qualidade. */
export const TEMPLATES_PER_RUN = 4;
/** Respostas do agente por execução. */
export const AGENT_REPLIES_PER_RUN = 10;

export type RecoveryAction =
  | "agent_reply"
  | "template"
  | "skipped_human"
  | "skipped_do_not_contact"
  | "skipped_no_template"
  | "skipped_closed";

export function decideRecovery(input: {
  withAgent: boolean;
  threadStatus: string | null;
  lastInboundAt: string | null;
  doNotContact: boolean;
  hasTemplate: boolean;
  now?: Date;
}): RecoveryAction {
  if (input.doNotContact) return "skipped_do_not_contact";
  if (input.threadStatus === "resolved" || input.threadStatus === "closed") return "skipped_closed";
  // Conversa com uma pessoa da equipe: quem retoma é ela (as mensagens recusadas aparecem na conversa).
  if (!input.withAgent) return "skipped_human";
  const last = Date.parse(input.lastInboundAt ?? "");
  const now = (input.now ?? new Date()).getTime();
  if (Number.isFinite(last) && now - last < FREE_REPLY_WINDOW_MS) return "agent_reply";
  return input.hasTemplate ? "template" : "skipped_no_template";
}

/** Template de retomada só em horário comercial (8h às 20h no fuso do agente). */
export function withinSendingHours(now: Date, timeZone = "America/Sao_Paulo"): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return hour >= 8 && hour <= 20;
}
