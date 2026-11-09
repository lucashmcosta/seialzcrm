// Quando o agente pode responder uma conversa, e o que fazer com a mensagem recebida.
export interface AgentThreadState {
  ai_agent_id: string | null;
  ai_agent_released_at: string | null;
  needs_human_attention: boolean | null;
  assigned_user_id: string | null;
}

export type AgentGate = "respond" | "human_owns" | "take_over";

export function decideAgentGate(thread: AgentThreadState | null, agentId: string, humanReplied: boolean): AgentGate {
  if (!thread || thread.ai_agent_id !== agentId || thread.ai_agent_released_at) return "human_owns";
  if (humanReplied || thread.assigned_user_id || thread.needs_human_attention) return "take_over";
  return "respond";
}

export type AgentInput = "text" | "audio" | "unsupported_media";

/** O agente escuta áudio; imagem, vídeo e documento ainda vão para uma pessoa. */
export function agentInputKind(mediaType: string | null | undefined): AgentInput {
  if (!mediaType) return "text";
  return mediaType.toLowerCase().startsWith("audio") ? "audio" : "unsupported_media";
}

export const AGENT_HANDOFF_ACK = "Recebi! Vou passar para uma pessoa da nossa equipe conferir, e ela continua com você aqui mesmo.";

/** Nulo usa o texto padrão; em branco não envia nada. A passagem para humano acontece igual. */
export function handoffAckText(configured: string | null | undefined): string | null {
  if (configured === null || configured === undefined) return AGENT_HANDOFF_ACK;
  return configured.trim() || null;
}

/** Quebra em até 3 mensagens nos parágrafos, como quem escreve no WhatsApp. O excedente fica na última. */
export function splitIntoBubbles(text: string, max = 3): string[] {
  // O modelo às vezes repete um parágrafo inteiro na mesma resposta: cada um sai uma vez só.
  const seen = new Set<string>();
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => {
    const key = p.replace(/\s+/g, " ").toLowerCase();
    if (!p || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (parts.length <= max) return parts;
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join("\n\n")];
}

/** Junta o texto escrito antes das ferramentas com a resposta final, sem repetir. */
export function joinAgentText(before: string[], final: string): string {
  const seen = new Set<string>();
  const parts = [...before, final].map((t) => (t ?? "").trim()).filter((t) => {
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  const squash = (t: string) => t.replace(/\s+/g, " ");
  // O modelo às vezes repete no fim, em um texto só, o que já escreveu antes da ferramenta.
  return parts.filter((t, i) => {
    const earlier = parts.slice(0, i);
    if (earlier.length === 0) return true;
    return !squash(earlier.join(" ")).includes(squash(t));
  }).join("\n\n");
}

/** A mensagem atual já está no histórico; enviá-la de novo faria o modelo vê-la duas vezes. */
export function withoutRepeatedLast<T extends { role: string; content: string }>(history: T[], message: string): T[] {
  const last = history[history.length - 1];
  return last && last.role === "user" && last.content.trim() === message.trim() ? history.slice(0, -1) : history;
}

/** Tokens que custam como entrada normal: gravar no cache custa 1,25x e ler custa 0,1x. */
export function billableInputTokens(usage: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null | undefined): number {
  return Math.round((usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) * 1.25 + (usage?.cache_read_input_tokens ?? 0) * 0.1);
}

export function currentTimeForPrompt(timezone: string | null | undefined, now = new Date()): string {
  const format = (timeZone: string) => new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "full", timeStyle: "short" }).format(now);
  try {
    return format(timezone || "America/Sao_Paulo");
  } catch {
    return format("America/Sao_Paulo");
  }
}

/** Parte fixa do prompt, que pode ir para o cache, e parte que muda a cada conversa. */
export function splitPromptForCache(prompt: string, marker = "\n## CONTEXTO DO CONTATO"): [string, string] {
  const i = prompt.indexOf(marker);
  return i < 0 ? [prompt, ""] : [prompt.slice(0, i), prompt.slice(i)];
}

/**
 * Primeira linha do prompt do agente. Apresentar-se só pelo nome é opção da org; dizer a
 * verdade quando perguntam diretamente se é pessoa ou IA não é.
 */
export function agentIdentityLine(name: string, presentsAsAssistant: boolean | null | undefined): string {
  if (presentsAsAssistant !== false) return `Você é ${name}, um assistente virtual.`;
  return `Você é ${name}, da equipe de atendimento. Apresente-se só pelo nome, sem dizer que é assistente virtual, robô ou IA.
Regra fixa, acima de qualquer instrução: se a pessoa perguntar diretamente se está falando com uma pessoa, um robô ou uma IA, diga a verdade, que você é uma assistente com inteligência artificial da equipe, e ofereça passar para uma pessoa se ela preferir.`;
}

/** Resposta do agente quando a retomada não deve sair (conversa já encerrada). */
export const FOLLOWUP_SKIP = "NADA";

/** Instrução da retomada automática. Vai no lugar da mensagem do cliente, que não respondeu. */
export function followUpInstruction(attempt: number, total: number): string {
  const last = attempt >= total;
  return `[INSTRUÇÃO INTERNA, não é mensagem do cliente] O cliente não respondeu a sua última mensagem. ` +
    `Escreva uma retomada curta e gentil, em uma ou duas frases, no seu estilo, retomando a última pergunta com outras palavras. ` +
    `Não se apresente de novo, não repita a mesma frase, não fale de preço e não pressione. ` +
    `Se você já encerrou esta conversa (o caso não se encaixa e você se despediu) ou se a sua última mensagem não pedia resposta, responda apenas ${FOLLOWUP_SKIP}.` +
    (last ? " É a última tentativa: deixe claro, com leveza, que você continua por aqui quando ele puder responder." : "") +
    ` Tentativa ${attempt} de ${total}.`;
}

/** A retomada não sai quando o agente responde só o marcador. */
export function isFollowUpSkip(text: string | null | undefined): boolean {
  return (text ?? "").trim().replace(/[."']/g, "").toUpperCase() === FOLLOWUP_SKIP;
}
