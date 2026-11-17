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

export type AgentInput = "text" | "audio" | "attachment" | "unsupported_media";

const ATTACHMENT_LABELS: Record<string, string> = {
  image: "uma foto",
  document: "um documento",
  video: "um vídeo",
  sticker: "uma figurinha",
};

/**
 * O agente escuta áudio. Foto, documento, vídeo e figurinha ele não vê, mas sabe que chegaram e
 * segue a conversa (por exemplo, agradece o documento que pediu). Outro tipo vai para uma pessoa.
 */
export function agentInputKind(mediaType: string | null | undefined): AgentInput {
  if (!mediaType) return "text";
  const kind = mediaType.toLowerCase();
  if (kind.startsWith("audio")) return "audio";
  return Object.keys(ATTACHMENT_LABELS).some((k) => kind.startsWith(k)) ? "attachment" : "unsupported_media";
}

/** O que o agente lê no lugar do anexo: o tipo, a legenda, e o aviso de que ele não vê o conteúdo. */
export function attachmentNote(mediaType: string, caption: string | null | undefined): string {
  const kind = mediaType.toLowerCase();
  const label = Object.entries(ATTACHMENT_LABELS).find(([k]) => kind.startsWith(k))?.[1] ?? "um arquivo";
  // Em documento o texto é o nome do arquivo, que costuma ter CPF e nome: não vai ao modelo.
  const text = kind.startsWith("document") ? "" : (caption ?? "").trim();
  const shown = text && !/^\[[^\]]*\]$/.test(text) ? ` com o texto: "${text.slice(0, 500)}"` : "";
  return `[O cliente enviou ${label}${shown}. Você não consegue ver nem conferir o arquivo: não diga o que tem nele, ` +
    `não diga que conferiu e não pergunte o que é cada arquivo. Agradeça e siga; quem confere é a equipe.]`;
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
  const whole = parts.filter((t, i) => {
    const earlier = parts.slice(0, i);
    if (earlier.length === 0) return true;
    return !squash(earlier.join(" ")).includes(squash(t));
  });
  // Ou repete com outras palavras ("Conta pra mim: hoje você trabalha...?").
  // Só o texto depois da ferramenta é conferido; uma resposta sem ferramenta fica igual.
  const known = new Set<string>(whole.length ? contentWords(whole[0]) : []);
  return whole.map((part, i) => {
    if (i === 0) return part;
    return part.split(/\n{2,}/).map((paragraph) => paragraph.split(/(?<=[.!?…])\s+/).filter((sentence) => {
      const words = contentWords(sentence);
      const repeated = words.length >= 3 && words.filter((w) => known.has(w)).length / words.length >= 0.8;
      words.forEach((w) => known.add(w));
      return !repeated;
    }).join(" ")).filter((p) => p.trim()).join("\n\n");
  }).filter((t) => t.trim()).join("\n\n");
}

const STOP_WORDS = new Set(("que com para por uma uns umas dos das nos nas não sim seu sua seus suas meu minha " +
  "você vocês ele ela isso esse essa este esta aqui mas ser foi tem ter são está estou").split(" "));

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP_WORDS.has(w));
}

/** Vai junto com o resultado da ferramenta quando o agente já escreveu algo antes dela. */
export const AFTER_TOOL_HINT =
  "O cliente já vai receber o texto que você escreveu antes desta ferramenta. Não repita nem reescreva " +
  "esse texto. Escreva só o que ainda falta dizer; se não falta nada, não escreva nada.";

/**
 * Resposta final do agente. Depois de encerrar ou passar para a equipe, o que já foi escrito
 * antes da ferramenta é a despedida: o texto de depois ("estou por aqui") não vai.
 */
export function agentReplyText(before: string[], final: string, closedByTool: boolean): string {
  const hasBefore = before.some((t) => (t ?? "").trim());
  return joinAgentText(before, closedByTool && hasBefore ? "" : final);
}

/** A mensagem atual já está no histórico; enviá-la de novo faria o modelo vê-la duas vezes. */
export function withoutRepeatedLast<T extends { role: string; content: string }>(history: T[], message: string): T[] {
  const last = history[history.length - 1];
  return last && last.role === "user" && last.content.trim() === message.trim() ? history.slice(0, -1) : history;
}

export const CROSSED_REPLY_NOTE = "[INSTRUÇÃO INTERNA, não mostre ao cliente: a mensagem abaixo chegou enquanto a sua última resposta era enviada, então essa resposta não leu esta mensagem. Não repita o que você acabou de dizer nem refaça uma pergunta que o cliente já respondeu. Responda só ao que ele disse agora.]";

/**
 * Mensagem do cliente que se cruzou com a resposta do agente: no histórico ela aparece antes
 * dessa resposta, que não a leu. Sem ajuste, o modelo vê a mensagem duas vezes e acha que já
 * respondeu. Tira a mensagem do meio, para ela ir só no fim, e diz se houve o cruzamento.
 */
export function placeCurrentMessage<T extends { role: string; content: string }>(history: T[], message: string): { history: T[]; crossed: boolean } {
  const target = message.trim().slice(0, 1000);
  let lastUser = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") { lastUser = i; break; }
  }
  if (lastUser < 0 || history[lastUser].content.trim().slice(0, 1000) !== target) return { history, crossed: false };
  return {
    history: [...history.slice(0, lastUser), ...history.slice(lastUser + 1)],
    crossed: lastUser < history.length - 1,
  };
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
    `Escreva uma retomada bem curta: no máximo 2 frases curtas, cerca de 120 letras, terminando com a pergunta que ficou pendente. ` +
    `Chame pelo nome se souber. Exemplo de tom: "Rafaela, ainda quer ver seu caso? Ficou faltando a data em que você saiu." ` +
    `Não copie o exemplo palavra por palavra. Não diga "vi que você não respondeu" nem "sem problema", e não explique o motivo da pergunta. ` +
    (attempt > 1 ? `Esta é a tentativa ${attempt}: use outras palavras. ` : "") +
    (last ? "É a última tentativa: diga, em poucas palavras, que você continua por aqui. " : "") +
    `Não se apresente de novo, não fale de preço e não pressione. ` +
    `Se você já encerrou esta conversa (o caso não se encaixa e você se despediu) ou se a sua última mensagem não pedia resposta, responda apenas ${FOLLOWUP_SKIP}. ` +
    `Tentativa ${attempt} de ${total}.`;
}

/** A retomada não sai quando o agente responde só o marcador. */
/** Remove o eco do encerramento ("Conversa encerrada.") em qualquer ponto do texto. Isso nunca vai ao cliente. */
export function stripCloseEcho(text: string): string {
  return text
    .replace(/(^|[\s.!?])(a\s+)?conversa\s+(foi\s+|está\s+)?(encerrada|finalizada)\s*[.!]?/gi, "$1")
    .replace(/^\s*encerrad[ao]\s*[.!]?\s*$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isFollowUpSkip(text: string | null | undefined): boolean {
  return (text ?? "").trim().replace(/[."']/g, "").toUpperCase() === FOLLOWUP_SKIP;
}

/**
 * O modelo às vezes escreve em Markdown, que o WhatsApp não entende: **negrito** aparece com os
 * asteriscos e [nome](#) aparece com colchetes. Passa para o formato do WhatsApp.
 */
export function toWhatsAppText(text: string): string {
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, "*$1*")
    .replace(/__([^_\n]+?)__/g, "_$1_")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/\[([^\]\n]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}

/** Depois da última retomada sem resposta, quanto esperar antes de passar a conversa quente para a equipe. */
export const SILENT_HANDOFF_AFTER_MS = 2 * 3600 * 1000;

/**
 * Conversa quente parada: o cliente já recebeu o resultado de uma ferramenta de widget (ex.: o cálculo),
 * o agente fez todas as retomadas e ele não respondeu a nenhuma. Aí vale uma pessoa da equipe tentar.
 */
export function shouldHandOffSilent(t: {
  hasWidgetResult: boolean;
  followupCount: number;
  followupTotal: number;
  lastFollowupAt: string | null;
  lastInboundAt: string | null;
}, now = Date.now()): boolean {
  if (!t.hasWidgetResult || t.followupTotal < 1 || t.followupCount < t.followupTotal || !t.lastFollowupAt) return false;
  const followupAt = new Date(t.lastFollowupAt).getTime();
  if (t.lastInboundAt && new Date(t.lastInboundAt).getTime() >= followupAt) return false;
  return now - followupAt >= SILENT_HANDOFF_AFTER_MS;
}
