// Regras puras do teste do agente com conversas antigas (agent-backtest).
// Vale para todas as orgs. Testado em tests/agent-backtest.test.ts.
import { agentInputKind, attachmentNote } from "./agent-gate.ts";
import { LABOR_CALC_CLIENT_HEADER } from "../labor-calc/agent.ts";

export interface StoredMessage {
  content: string | null;
  direction: string;
  media_type: string | null;
  transcript?: string | null;
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
    if (kind === "attachment") return attachmentNote(m.media_type ?? "document", m.content);
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

export function parseBrl(raw: string): number | null {
  const n = Number(raw.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) && raw.trim() ? n : null;
}

export interface ParsedCalc {
  total: number | null;
  /** Linha com o tipo de saída e o período ("Dispensa sem justa causa · 01/09/2025 a 31/10/2026"). */
  header: string | null;
  salary: number | null;
}

/** Lê a mensagem "Cálculo da sua rescisão" do widget (a mesma que o agente manda). */
export function parseCalcText(text: string): ParsedCalc | null {
  if (!text.startsWith(LABOR_CALC_CLIENT_HEADER)) return null;
  const lines = text.split("\n");
  const total = lines.find((l) => l.startsWith("*Total"))?.match(/R\$\s?[\d.,]+/)?.[0];
  const salary = lines.find((l) => l.startsWith("Salário considerado"))?.match(/R\$\s?[\d.,]+/)?.[0];
  return {
    total: total ? parseBrl(total) : null,
    header: lines[1]?.trim() || null,
    salary: salary ? parseBrl(salary) : null,
  };
}

export type BacktestOutcome = "mesmo_total" | "total_diferente" | "pediu_dados" | "sem_calculadora" | "erro";

/** Diferença de até 1% conta como o mesmo total (arredondamento). */
export function classifyCase(team: ParsedCalc | null, agent: ParsedCalc | null, toolCalled: boolean): BacktestOutcome {
  if (agent?.total != null && team?.total != null) {
    return Math.abs(agent.total - team.total) <= Math.max(1, team.total * 0.01) ? "mesmo_total" : "total_diferente";
  }
  if (agent) return "total_diferente";
  return toolCalled ? "pediu_dados" : "sem_calculadora";
}

export function countOutcomes(outcomes: BacktestOutcome[]): Record<BacktestOutcome, number> {
  const counts: Record<BacktestOutcome, number> = { mesmo_total: 0, total_diferente: 0, pediu_dados: 0, sem_calculadora: 0, erro: 0 };
  for (const o of outcomes) counts[o]++;
  return counts;
}

/** Resposta "Rate limit exceeded ... Retry after 55753ms." do Supabase: quanto esperar, ou null. */
export function rateLimitWaitMs(body: unknown): number | null {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  if (!/rate limit/i.test(text)) return null;
  const ms = text.match(/retry after (\d+)\s*ms/i)?.[1];
  return ms ? Number(ms) : 60_000;
}
