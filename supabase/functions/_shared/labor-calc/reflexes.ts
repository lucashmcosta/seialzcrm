export interface Line {
  label: string;
  value: number;
}

export interface ReflexToggles {
  dsr: boolean;
  decimo: boolean;
  ferias: boolean;
  fgts: boolean;
}

export interface ReflexInput {
  /** Valor mensal médio da parcela. */
  monthly: number;
  months: number;
  toggles: ReflexToggles;
  /** Repousos ÷ dias úteis (ex.: 5/25 = 20%). `null` = parcela já mensal, sem DSR (insalubridade, periculosidade). */
  dsrRate: number | null;
  /** 0..1: quanto do DSR reflete em 13º/férias (tese TST a partir de 20/03/2023). */
  dsrReflexShare: number;
  /** Multa do FGTS (0,4 / 0,2 / 0). */
  fineRate: number;
}

/**
 * Principal + reflexos de uma parcela habitual.
 * - DSR sobre o principal (Súmula 172 TST).
 * - 13º e férias + 1/3 sobre principal + DSR (o DSR só na parcela após 20/03/2023).
 * - FGTS 8% sobre principal + DSR + 13º (férias tratadas como indenizadas, sem FGTS), e multa sobre ele.
 */
export function withReflexes(i: ReflexInput): { lines: Line[]; total: number } {
  const principal = i.monthly * i.months;
  const dsr = i.toggles.dsr && i.dsrRate != null ? principal * i.dsrRate : 0;
  const base = principal + dsr * i.dsrReflexShare;
  const decimo = i.toggles.decimo ? base / 12 : 0;
  const ferias = i.toggles.ferias ? (base / 12) * (4 / 3) : 0;
  const fgts = i.toggles.fgts ? 0.08 * (principal + dsr + decimo) : 0;
  const fine = fgts * i.fineRate;

  const lines: Line[] = [{ label: 'Principal', value: principal }];
  if (dsr) lines.push({ label: 'Reflexo em DSR', value: dsr });
  if (decimo) lines.push({ label: 'Reflexo em 13º', value: decimo });
  if (ferias) lines.push({ label: 'Reflexo em férias + 1/3', value: ferias });
  if (fgts) lines.push({ label: 'FGTS 8%', value: fgts });
  if (fine) lines.push({ label: `Multa ${Math.round(i.fineRate * 100)}% FGTS`, value: fine });
  return { lines, total: lines.reduce((s, l) => s + l.value, 0) };
}
