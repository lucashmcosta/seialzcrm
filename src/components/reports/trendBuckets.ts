export interface TrendBucketRow {
  /** YYYY-MM-DD (local day) */
  bucket_date: string;
  created: number;
  won: number;
}

export type Granularity = 'daily' | 'weekly';

export const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

export function formatBucketLabel(d: Date, _weekly: boolean) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function defaultGranularityFor(from: Date, to: Date): Granularity {
  const days = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;
  return days > 90 ? 'weekly' : 'daily';
}

/** Buckets contínuos (sem lacunas) no período, com created/won somados. */
export function buildTrendBuckets(
  data: TrendBucketRow[],
  from: Date,
  to: Date,
  weekly: boolean,
): { label: string; created: number; won: number }[] {
  const buckets = new Map<number, { created: number; won: number; date: Date }>();

  const start = weekly ? startOfWeek(from) : startOfDay(from);
  const end = weekly ? startOfWeek(to) : startOfDay(to);
  for (let cur = new Date(start); cur <= end; ) {
    buckets.set(cur.getTime(), { created: 0, won: 0, date: new Date(cur) });
    cur.setDate(cur.getDate() + (weekly ? 7 : 1));
  }

  for (const row of data) {
    const day = parseLocalDate(row.bucket_date);
    if (!day) continue;
    const key = (weekly ? startOfWeek(day) : startOfDay(day)).getTime();
    const b = buckets.get(key);
    if (!b) continue;
    b.created += Number(row.created) || 0;
    b.won += Number(row.won) || 0;
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((b) => ({
      label: formatBucketLabel(b.date, weekly),
      created: b.created,
      won: b.won,
    }));
}
