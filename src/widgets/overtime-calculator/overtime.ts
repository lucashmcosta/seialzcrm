export interface OvertimeInput {
  salary: number;
  divisor: number;
  hours: number;
  percent: number; // ex.: 50 = 50%
}

export interface OvertimeResult {
  hourly: number;
  overtimeHourly: number;
  total: number;
}

export function calcOvertime({ salary, divisor, hours, percent }: OvertimeInput): OvertimeResult | null {
  if (!(salary > 0) || !(divisor > 0) || !(hours >= 0) || !(percent >= 0)) return null;
  const hourly = salary / divisor;
  const overtimeHourly = hourly * (1 + percent / 100);
  return { hourly, overtimeHourly, total: overtimeHourly * hours };
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
