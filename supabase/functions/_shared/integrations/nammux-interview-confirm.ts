// Confirmação da entrevista pelo próprio cliente, no botão.
//
// O cliente escolhe um horário com o agente de atendimento; o agente só deixa o
// horário PROPOSTO e manda "Confirmar" / "Outro horário". O pedido vai para a
// agenda do Nammux só quando o cliente toca em Confirmar. A leitura do toque é
// fixa, sem chamar modelo de IA (mesmo jeito da avaliação "Consegui te ajudar?").
import type { InteractivePayload } from "../whatsapp-interactive.ts";
import { agendaWhen } from "./nammux-process-context.ts";
import type { NammuxSlots } from "./nammux-agent-tools.ts";

export const INTERVIEW_CONFIRM_ID = "interview_confirm";
export const INTERVIEW_OTHER_ID = "interview_other";
export const INTERVIEW_CONFIRM_TITLE = "Confirmar";
export const INTERVIEW_OTHER_TITLE = "Outro horário";
/** Por quanto tempo o horário proposto espera o toque do cliente. */
export const PROPOSAL_TTL_MINUTES = 120;

export const SLOT_TAKEN_NOTE =
  "[Sistema: o cliente tocou em Confirmar, mas esse horário foi ocupado antes. Nada foi marcado. Peça desculpas, consulte os horários livres de novo e ofereça outros.]";
export const CONFIRM_FAILED_TEXT =
  "Não consegui registrar sua entrevista agora. Vou passar sua conversa para uma pessoa da equipe, que já te ajuda.";

/** A pergunta que vai com os dois botões, depois do texto do agente. */
export function interviewConfirmQuestion(when: string): InteractivePayload {
  return {
    kind: "buttons",
    body: `Entrevista ${when}. Para garantir esse horário, toque em ${INTERVIEW_CONFIRM_TITLE}.`,
    buttons: [
      { id: INTERVIEW_CONFIRM_ID, title: INTERVIEW_CONFIRM_TITLE },
      { id: INTERVIEW_OTHER_ID, title: INTERVIEW_OTHER_TITLE },
    ],
  };
}

export function interviewRequestedText(when: string): string {
  return `Pronto! Pedi sua entrevista para ${when}. Assim que o escritório registrar na agenda, te mando a confirmação por aqui.`;
}

/**
 * Só vale resposta curta e inequívoca: o toque no botão, o número da opção
 * quando saiu como texto ("1", "2") ou a palavra sozinha. Qualquer outra coisa
 * é conversa e segue para o agente.
 */
export function parseInterviewAnswer(text: unknown): "confirm" | "other" | null {
  if (typeof text !== "string") return null;
  const t = text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!\s]+$/g, "");
  if (["confirmar", "confirmo", "confirmado", "1", "sim, confirmo", "sim confirmo", "pode confirmar"].includes(t)) return "confirm";
  if (["outro horario", "outro", "2", "quero outro horario", "outro dia"].includes(t)) return "other";
  return null;
}

export interface InterviewProposal {
  id: string;
  opportunity_id: string;
  requested_start_at: string;
  requested_end_at: string | null;
}

export interface InterviewConfirmDeps {
  /** O horário proposto em aberto nesta conversa (ainda no prazo), ou null. */
  openProposal(): Promise<InterviewProposal | null>;
  /** Fecha a proposta se ainda estava aberta. false = alguém já fechou. */
  closeProposal(id: string, status: "accepted" | "declined" | "expired"): Promise<boolean>;
  fetchSlots(opportunityId: string): Promise<NammuxSlots | null>;
  /** Grava o pedido e enfileira o evento para o Nammux. Devolve o status de nammux_request_interview. */
  requestInterview(opportunityId: string, startAt: string, endAt: string | null): Promise<string | null>;
}

export type InterviewConfirmResult =
  /** Texto fixo ao cliente; o agente não roda. */
  | { kind: "reply"; text: string; handOff: boolean; outcome: string }
  /** O agente roda, com esta nota junto da mensagem do cliente (ou sem nota). */
  | { kind: "continue"; note: string | null; outcome: string };

/** null = a mensagem não é resposta da confirmação; o agente segue normalmente. */
export async function captureInterviewConfirmation(message: unknown, deps: InterviewConfirmDeps): Promise<InterviewConfirmResult | null> {
  const answer = parseInterviewAnswer(message);
  if (!answer) return null;
  const proposal = await deps.openProposal();
  if (!proposal) return null;

  if (answer === "other") {
    await deps.closeProposal(proposal.id, "declined");
    // O agente vê "Outro horário" no histórico e oferece outros.
    return { kind: "continue", note: null, outcome: "interview_other" };
  }

  if (!(await deps.closeProposal(proposal.id, "accepted"))) return null;

  // Confere a agenda de novo: o horário pode ter sido tomado enquanto o cliente pensava.
  const fresh = await deps.fetchSlots(proposal.opportunity_id);
  const asked = new Date(proposal.requested_start_at).toISOString();
  const slot = fresh?.enabled ? fresh.slots.find((s) => s.start_at === asked) : undefined;
  if (!fresh || !slot) {
    return { kind: "continue", note: SLOT_TAKEN_NOTE, outcome: fresh ? "interview_slot_taken" : "interview_agenda_unavailable" };
  }

  const status = await deps.requestInterview(proposal.opportunity_id, slot.start_at, slot.end_at);
  const when = agendaWhen(slot.start_at, false, fresh.timezone) ?? "o horário escolhido";
  if (status === "requested" || status === "already_requested") {
    return { kind: "reply", text: interviewRequestedText(when), handOff: false, outcome: "interview_confirmed_by_client" };
  }
  return { kind: "reply", text: CONFIRM_FAILED_TEXT, handOff: true, outcome: "interview_confirm_failed" };
}

/** Dependências reais para uma conversa. */
export function interviewConfirmDeps(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ctx: { organizationId: string; threadId: string },
  nammux: Pick<InterviewConfirmDeps, "fetchSlots" | "requestInterview">,
): InterviewConfirmDeps {
  return {
    async openProposal() {
      const since = new Date(Date.now() - PROPOSAL_TTL_MINUTES * 60_000).toISOString();
      const { data } = await supabase.from("nammux_interview_requests")
        .select("id, opportunity_id, requested_start_at, requested_end_at")
        .eq("organization_id", ctx.organizationId).eq("thread_id", ctx.threadId)
        .eq("status", "proposed").gte("created_at", since)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return (data ?? null) as InterviewProposal | null;
    },
    async closeProposal(id, status) {
      const { data, error } = await supabase.from("nammux_interview_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id).eq("status", "proposed").select("id");
      return !error && Array.isArray(data) && data.length > 0;
    },
    fetchSlots: nammux.fetchSlots,
    requestInterview: nammux.requestInterview,
  };
}
