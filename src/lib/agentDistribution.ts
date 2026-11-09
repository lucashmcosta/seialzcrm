/** Texto padrão do aviso, igual ao de agent-gate.ts (conferido em tests/agent-gate.test.ts). */
export const DEFAULT_HANDOFF_ACK = 'Recebi! Vou passar para uma pessoa da nossa equipe conferir, e ela continua com você aqui mesmo.';

export type DistributionMode = 'all' | 'every_n' | 'percent' | 'daily_quota';

export const DISTRIBUTION_LIMITS: Record<Exclude<DistributionMode, 'all'>, { min: number; max: number }> = {
  every_n: { min: 2, max: 100 },
  percent: { min: 1, max: 100 },
  daily_quota: { min: 1, max: 10000 },
};

export function isValidDistribution(mode: DistributionMode, value: number | null): boolean {
  if (mode === 'all') return true;
  if (value === null || !Number.isInteger(value)) return false;
  const { min, max } = DISTRIBUTION_LIMITS[mode];
  return value >= min && value <= max;
}

export function describeDistribution(mode: DistributionMode, value: number | null): string {
  if (mode === 'all') return 'O agente recebe todos os leads novos do WhatsApp.';
  if (!isValidDistribution(mode, value)) return 'Informe um valor válido.';
  if (mode === 'every_n') return `O agente recebe 1 a cada ${value} leads novos. Os outros vão para o rodízio dos vendedores.`;
  if (mode === 'percent') return `O agente recebe ${value}% dos leads novos, em sequência. Os outros vão para o rodízio dos vendedores.`;
  return `O agente recebe os primeiros ${value} leads novos de cada dia. Depois disso, vão para o rodízio dos vendedores.`;
}
