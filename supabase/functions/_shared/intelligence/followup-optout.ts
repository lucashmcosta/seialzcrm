// Botão "Não tenho interesse" na retomada do agente (mensagem de sessão, sem template).
// Quem não quer mais conversar toca no botão em vez de bloquear ou denunciar o número:
// bloqueio e denúncia derrubam a qualidade e levam à restrição da conta na Meta.
// Configuração por agente (ai_agents.followup_optout_attempt): null = desligado,
// 1 = na 1ª retomada, 2 = na 2ª. Sem dependências de Deno (testável).
import type { InteractivePayload } from "../whatsapp-interactive.ts";

export const FOLLOWUP_OPTOUT_ID = "agent_followup_optout";
export const FOLLOWUP_OPTOUT_TITLE = "Não tenho interesse";
export const FOLLOWUP_OPTOUT_REPLY = "Tudo bem, não vou mais te mandar mensagens por aqui. Se precisar, é só chamar.";

/** Esta retomada leva o botão? Se a configuração pede uma tentativa que não existe, vai na última. */
export function shouldOfferFollowUpOptOut(
  attempt: number,
  total: number,
  optoutAttempt: number | null | undefined,
): boolean {
  if (!optoutAttempt || optoutAttempt < 1 || total < 1) return false;
  return attempt === Math.min(optoutAttempt, total);
}

/** A retomada vira o texto da mensagem com um único botão de saída. */
export function followUpOptOutInteractive(body: string): InteractivePayload {
  return { kind: "buttons", body, buttons: [{ id: FOLLOWUP_OPTOUT_ID, title: FOLLOWUP_OPTOUT_TITLE }] };
}

function key(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const TYPED_OPTOUT = new Set(["nao tenho interesse", "nao tenho mais interesse"]);

/** O cliente tocou no botão de saída (ou digitou exatamente o texto dele). */
export function isFollowUpOptOut(
  metadata: { interactive_reply?: { id?: string | null } | null } | null | undefined,
  content: string | null | undefined,
): boolean {
  if (metadata?.interactive_reply?.id === FOLLOWUP_OPTOUT_ID) return true;
  return TYPED_OPTOUT.has(key(content));
}
