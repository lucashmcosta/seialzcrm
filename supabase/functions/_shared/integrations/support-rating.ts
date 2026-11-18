// Avaliação do agente de ATENDIMENTO: "Consegui te ajudar?" (Sim / Não).
// Pergunta e leitura da resposta são fixas — nenhuma chamada a modelo de IA.
// Só agent_type = 'support' com a flag `support_agent_rating` da organização.
import type { InteractivePayload } from "../whatsapp-interactive.ts";

export const SUPPORT_RATING_FLAG = "support_agent_rating";
export const RATING_QUESTION = "Consegui te ajudar?";
export const RATING_YES = "Sim";
export const RATING_NO = "Não";
export const RATING_THANKS = "Que bom! Se precisar de mais alguma coisa, é só chamar.";
export const RATING_SORRY = "Sinto muito por não ter conseguido ajudar. Vou passar a sua conversa para uma pessoa da equipe.";

/** A pergunta, com os dois botões. Em provedor sem botão sai como texto numerado. */
export function ratingQuestion(): InteractivePayload {
  return { kind: "buttons", body: RATING_QUESTION, buttons: [{ id: "rating_yes", title: RATING_YES }, { id: "rating_no", title: RATING_NO }] };
}

/**
 * Lê a resposta. Só vale resposta curta e inequívoca: o toque no botão ("Sim",
 * "Não"), o número da opção quando saiu como texto ("1", "2"), ou a palavra
 * sozinha. "Sim, mas tenho outra dúvida" NÃO é avaliação: é conversa, e segue
 * para o agente responder.
 */
export function parseRatingAnswer(text: unknown): "yes" | "no" | null {
  if (typeof text !== "string") return null;
  const t = text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!\s]+$/g, "");
  if (["sim", "s", "1", "conseguiu", "sim, conseguiu", "👍"].includes(t)) return "yes";
  if (["nao", "n", "2", "nao conseguiu", "👎"].includes(t)) return "no";
  return null;
}

export interface RatingDeps {
  /** Id da pergunta em aberto nesta conversa, ou null. */
  openRating(): Promise<string | null>;
  /** Grava a resposta; false quando já havia resposta. */
  record(ratingId: string, answer: "yes" | "no"): Promise<boolean>;
}

/**
 * Se a mensagem do cliente é a resposta da avaliação, grava e devolve o que
 * fazer. null = não é avaliação; o agente segue normalmente.
 */
export async function captureRating(message: unknown, deps: RatingDeps): Promise<{ answer: "yes" | "no"; reply: string; handOff: boolean } | null> {
  const answer = parseRatingAnswer(message);
  if (!answer) return null;
  const ratingId = await deps.openRating();
  if (!ratingId) return null;
  if (!(await deps.record(ratingId, answer))) return null;
  return answer === "yes"
    ? { answer, reply: RATING_THANKS, handOff: false }
    : { answer, reply: RATING_SORRY, handOff: true };
}

/** Só o agente de atendimento, e só com a flag ligada. Para os outros, null sem consultar nada. */
export async function ratingForAgent<T>(
  agentType: unknown,
  isEnabled: (flag: string) => Promise<boolean>,
  run: () => Promise<T | null>,
): Promise<T | null> {
  if (agentType !== "support") return null;
  if (!(await isEnabled(SUPPORT_RATING_FLAG))) return null;
  return await run();
}

// deno-lint-ignore no-explicit-any
export function ratingDeps(supabase: any, threadId: string): RatingDeps {
  return {
    async openRating() {
      const { data } = await supabase.rpc("support_rating_open", { _thread_id: threadId });
      return typeof data === "string" ? data : null;
    },
    async record(ratingId, answer) {
      const { data, error } = await supabase.rpc("support_rating_record", { _rating_id: ratingId, _answer: answer });
      return !error && data === true;
    },
  };
}
