// Regras puras do gasto estimado das chaves de IA (testadas em tests/ai-spend.test.ts).
export type AiSpendRow = {
  provider: string;
  action: string;
  calls: number | string;
  cost_usd: number | string;
  calls_without_cost: number | string;
};

export type AiSpendAction = { action: string; calls: number; costUsd: number };

export type AiProviderSpend = {
  costUsd: number;
  calls: number;
  callsWithoutCost: number;
  actions: AiSpendAction[];
};

// A API devolve bigint/numeric como texto em alguns casos.
export function summarizeAiSpend(rows: AiSpendRow[]): Record<string, AiProviderSpend> {
  const out: Record<string, AiProviderSpend> = {};
  for (const row of rows) {
    const spend = (out[row.provider] ??= { costUsd: 0, calls: 0, callsWithoutCost: 0, actions: [] });
    const calls = Number(row.calls) || 0;
    const costUsd = Number(row.cost_usd) || 0;
    spend.costUsd += costUsd;
    spend.calls += calls;
    spend.callsWithoutCost += Number(row.calls_without_cost) || 0;
    spend.actions.push({ action: row.action, calls, costUsd });
  }
  for (const spend of Object.values(out)) {
    spend.actions.sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  }
  return out;
}

export type BudgetLevel = 'none' | 'ok' | 'warning' | 'exceeded';

export function budgetUsage(costUsd: number, budgetUsd: number | string | null | undefined): { percent: number; level: BudgetLevel } {
  const budget = Number(budgetUsd);
  if (!budget || budget <= 0) return { percent: 0, level: 'none' };
  const percent = (costUsd / budget) * 100;
  return { percent: Math.min(percent, 100), level: percent >= 100 ? 'exceeded' : percent >= 80 ? 'warning' : 'ok' };
}

// Valor pequeno não vira "US$ 0,00", o que pareceria que nada foi gasto.
export function formatUsd(value: number, locale: string): string {
  const number = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value > 0 && value < 0.01) return `< US$ ${number(0.01)}`;
  return `US$ ${number(value)}`;
}
