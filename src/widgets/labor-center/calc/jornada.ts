/** Da jornada que o lead descreve (entrada, saída, almoço, dias) para horas por mês. */

/** Semanas por mês em média (365,25 ÷ 7 ÷ 12). */
export const WEEKS_PER_MONTH = 365.25 / 7 / 12;

/** "08:00", "8:30", "8h30", "8h", "8" → minutos desde 00:00. Inválido → null. */
export function parseTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?:[:h](\d{2})?)?\s*h?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export const fmtTime = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export interface Schedule {
  /** Minutos desde 00:00. Saída menor que a entrada = virou a noite. */
  start: number;
  end: number;
  breakMinutes: number;
  daysPerWeek: number;
}

/** Duração do expediente (da entrada à saída), em minutos. */
export const spanMinutes = (s: Pick<Schedule, 'start' | 'end'>) => {
  const span = s.end - s.start;
  return span > 0 ? span : span + 1440;
};

/** Horas efetivamente trabalhadas por dia (expediente menos o intervalo que de fato tirava). */
export const workedHoursPerDay = (s: Schedule) => Math.max(0, spanMinutes(s) - s.breakMinutes) / 60;

/** Minutos do expediente entre 22h e 5h (art. 73 §2º CLT), em relógio. */
export function nightMinutesPerDay(s: Pick<Schedule, 'start' | 'end'>): number {
  const a = s.start;
  const b = a + spanMinutes(s);
  // janelas noturnas em dois dias seguidos: 00–05, 22–05 (+1), 22–05 (+2)
  const windows: [number, number][] = [[0, 300], [1320, 1740], [2760, 3180]];
  return windows.reduce((acc, [w0, w1]) => acc + Math.max(0, Math.min(b, w1) - Math.max(a, w0)), 0);
}

/** Intervalo mínimo (art. 71): acima de 6h = 1h; acima de 4h até 6h = 15 min. */
export const requiredBreakMinutes = (workedHours: number) => (workedHours > 6 ? 60 : workedHours > 4 ? 15 : 0);

/** Limite diário: 8h; jornadas de até 36h semanais (6×6) usam 6h por dia. */
export const dailyLimit = (contractualWeekly: number) => (contractualWeekly <= 36 ? contractualWeekly / 6 : 8);

export interface ScheduleHoursInput {
  schedule: Schedule;
  contractualWeekly: number;
  /** Domingos/feriados trabalhados por mês sem folga compensatória (fora dos dias da semana normais). */
  restDaysWorkedPerMonth: number;
  /** Horas extras que a empresa já pagava por mês (holerite). */
  paidOvertimePerMonth: number;
}

export interface ScheduleHours {
  workedPerDay: number;
  weekly: number;
  /** Horas extras por semana: o maior entre o excesso diário somado e o excesso semanal (não se somam). */
  weeklyOvertime: number;
  hours50: number;
  hours100: number;
  breakSuppressedMinutes: number;
  breakDaysPerMonth: number;
  nightHoursPerMonth: number;
}

export function scheduleHours(i: ScheduleHoursInput): ScheduleHours {
  const s = i.schedule;
  const days = Math.min(7, Math.max(0, s.daysPerWeek));
  const workedPerDay = workedHoursPerDay(s);
  const weekly = workedPerDay * days;
  const daily = Math.max(0, workedPerDay - dailyLimit(i.contractualWeekly)) * days;
  const weeklyOvertime = Math.max(daily, weekly - i.contractualWeekly, 0);
  const hours50 = Math.max(0, weeklyOvertime * WEEKS_PER_MONTH - Math.max(0, i.paidOvertimePerMonth));
  const hours100 = Math.max(0, i.restDaysWorkedPerMonth) * workedPerDay;
  const breakSuppressedMinutes = Math.max(0, requiredBreakMinutes(workedPerDay) - s.breakMinutes);
  return {
    workedPerDay,
    weekly,
    weeklyOvertime,
    hours50,
    hours100,
    breakSuppressedMinutes,
    breakDaysPerMonth: days * WEEKS_PER_MONTH,
    nightHoursPerMonth: (nightMinutesPerDay(s) / 60) * days * WEEKS_PER_MONTH,
  };
}
