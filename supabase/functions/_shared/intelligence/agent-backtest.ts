// Regras puras do teste do agente com conversas antigas (agent-backtest). O que é de cada
// cenário (por exemplo, comparar o cálculo da rescisão) fica no widget do cenário.
// Vale para todas as orgs. Testado em tests/agent-backtest.test.ts.
import { agentInputKind, attachmentNote } from "./agent-gate.ts";

export interface StoredMessage {
  content: string | null;
  direction: string;
  media_type: string | null;
  transcript?: string | null;
  /** O que um widget leu do anexo (ex.: carteira de trabalho digital), como o agente recebe. */
  note?: string | null;
}

export interface Replay {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
}

const MAX_HISTORY = 80;
const MAX_CHARS = 1000;

/** Como o agente leria a mensagem: anexo vira aviso, áudio entra pelo que foi dito. */
function asAgentReads(m: StoredMessage): string {
  if (m.direction === "inbound") {
    const kind = agentInputKind(m.media_type);
    if (kind === "attachment") return [attachmentNote(m.media_type ?? "document", m.content), m.note].filter(Boolean).join("\n");
    if (kind === "audio") return (m.transcript ?? "").trim() || "[Áudio sem transcrição]";
  }
  return (m.content ?? "").trim() || (m.media_type ? `[${m.media_type}]` : "");
}

/**
 * Conversa até a última mensagem do cliente antes do momento testado: o histórico vai antes e a
 * última mensagem do cliente é a que o agente responde. Sem mensagem do cliente, não há teste.
 */
export function buildReplay(messages: StoredMessage[]): Replay | null {
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === "inbound") { last = i; break; }
  }
  if (last < 0) return null;
  const message = asAgentReads(messages[last]).slice(0, MAX_CHARS);
  if (!message) return null;
  const history = messages.slice(0, last)
    .map((m) => ({ role: m.direction === "inbound" ? "user" as const : "assistant" as const, content: asAgentReads(m).slice(0, MAX_CHARS) }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_HISTORY);
  return { history, message };
}

/** Resposta "Rate limit exceeded ... Retry after 55753ms." do Supabase: quanto esperar, ou null. */
export function rateLimitWaitMs(body: unknown): number | null {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  if (!/rate limit/i.test(text)) return null;
  const ms = text.match(/retry after (\d+)\s*ms/i)?.[1];
  return ms ? Number(ms) : 60_000;
}
