/** Datas sempre em UTC (meia-noite) para não sofrer com fuso/horário de verão. */
const DAY = 86_400_000;

export function toDate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt : null;
}

export const todayYMD = () => {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
};

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02). */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

export const addYears = (d: Date, n: number) => addMonths(d, 12 * n);

/** Dias corridos de a até b (b − a). */
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

export const maxDate = (a: Date, b: Date) => (a > b ? a : b);

export function fullYears(from: Date, to: Date): number {
  let y = to.getUTCFullYear() - from.getUTCFullYear();
  if (addYears(from, y) > to) y--;
  return Math.max(0, y);
}

/** Meses corridos (com fração) entre duas datas, inclusive. */
export const monthsReal = (start: Date, end: Date) =>
  end < start ? 0 : (daysBetween(start, end) + 1) / (365.25 / 12);

/** Avos: meses completos a partir de `start`; sobra de 15 dias ou mais conta 1 avo (art. 146 CLT). */
export function avos(start: Date, end: Date): number {
  if (end < start) return 0;
  let n = 0;
  while (addDays(addMonths(start, n + 1), -1) <= end) n++;
  const rest = daysBetween(addMonths(start, n), end) + 1;
  return rest >= 15 ? n + 1 : n;
}

/** Avos de 13º: meses do ano civil com 15 dias ou mais trabalhados (Lei 4.090/62). */
export function avos13(start: Date, end: Date): number {
  if (end < start) return 0;
  const year = end.getUTCFullYear();
  let n = 0;
  for (let m = 0; m <= end.getUTCMonth(); m++) {
    const first = new Date(Date.UTC(year, m, 1));
    const last = new Date(Date.UTC(year, m + 1, 0));
    const a = maxDate(first, start);
    const b = end < last ? end : last;
    if (b >= a && daysBetween(a, b) + 1 >= 15) n++;
  }
  return n;
}

export const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
