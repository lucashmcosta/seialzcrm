/** Hora normal, adicionais e parcelas mensais. Funções puras, sem estado do widget. */

export type InsalubrityGrade = 0 | 10 | 20 | 40;
export const HAZARD_PCT = 30;
export const NIGHT_PCT = 20;
/** Hora noturna reduzida: 52min30s (art. 73 §1º CLT) → 60 / 52,5 = 8/7. */
export const NIGHT_HOUR_FACTOR = 60 / 52.5;

export interface AllowanceInput {
  salary: number;
  minimumWage: number;
  insalubrity: InsalubrityGrade;
  hazard: boolean;
}

export interface AllowanceResult {
  insalubrity: number;
  hazard: number;
  /** Adicional que conta (não se acumulam — TST, IRR Tema 17): o maior. */
  applied: 'insalubrity' | 'hazard' | null;
  value: number;
  bothSelected: boolean;
}

/** Insalubridade sobre o salário mínimo (10/20/40%); periculosidade 30% do salário-base. */
export function calcAllowance({ salary, minimumWage, insalubrity, hazard }: AllowanceInput): AllowanceResult {
  const ins = (minimumWage * insalubrity) / 100;
  const haz = hazard ? (salary * HAZARD_PCT) / 100 : 0;
  const applied = !ins && !haz ? null : haz >= ins ? 'hazard' : 'insalubrity';
  return {
    insalubrity: ins,
    hazard: haz,
    applied,
    value: applied === 'hazard' ? haz : applied === 'insalubrity' ? ins : 0,
    bothSelected: ins > 0 && hazard,
  };
}

/** Hora normal: (salário + adicional que integra a base, Súmulas 139/191/264 TST) ÷ divisor. */
export const hourlyRate = (salary: number, allowance: number, divisor: number) =>
  divisor > 0 ? (salary + allowance) / divisor : NaN;

export interface OvertimeBands {
  hours50: number;
  pct50: number;
  hours100: number;
  pct100: number;
}

export function overtimeMonthly(hourly: number, b: OvertimeBands) {
  const v50 = hourly * (1 + b.pct50 / 100) * b.hours50;
  const v100 = hourly * (1 + b.pct100 / 100) * b.hours100;
  return { v50, v100, monthly: v50 + v100 };
}

/** Adicional noturno: 20% da hora sobre as horas noturnas reduzidas. */
export const nightMonthly = (hourly: number, realNightHours: number) =>
  hourly * (NIGHT_PCT / 100) * realNightHours * NIGHT_HOUR_FACTOR;

/** Intervalo intrajornada suprimido pós-reforma (art. 71 §4º): só o tempo suprimido, +50%, indenizatório. */
export const breakMonthly = (hourly: number, minutesPerDay: number, daysPerMonth: number) =>
  hourly * 1.5 * (minutesPerDay / 60) * daysPerMonth;
