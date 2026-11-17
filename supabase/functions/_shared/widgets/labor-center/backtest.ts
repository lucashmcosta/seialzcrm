// Cenário labor_calc do teste com conversas antigas (agent-backtest): compara o cálculo da
// rescisão que o agente mandaria com o que a equipe mandou pelo widget.
import { LABOR_CALC_CLIENT_HEADER } from "./agent-tool.ts";

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

