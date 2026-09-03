import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';


interface TrendBucket {
  /** YYYY-MM-DD (local day) */
  bucket_date: string;
  created: number;
  won: number;
}

const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

interface Props {
  data: TrendBucket[];
  from: Date;
  to: Date;
  loading?: boolean;
}


function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function formatBucketLabel(d: Date, weekly: boolean) {
  if (weekly) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

type Granularity = 'daily' | 'weekly';

export function DashboardTrendChart({ data, from, to, loading }: Props) {
  const defaultGranularity: Granularity = useMemo(() => {
    const days = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;
    return days > 90 ? 'weekly' : 'daily';
  }, [from, to]);

  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);

  useEffect(() => {
    setGranularity(defaultGranularity);
  }, [defaultGranularity]);

  const weekly = granularity === 'weekly';

  const series = useMemo(() => {
    const buckets = new Map<number, { entered: number; closed: number; date: Date }>();

    const start = weekly ? startOfWeek(from) : startOfDay(from);
    const end = weekly ? startOfWeek(to) : startOfDay(to);
    for (let cur = new Date(start); cur <= end; ) {
      buckets.set(cur.getTime(), { entered: 0, closed: 0, date: new Date(cur) });
      cur.setDate(cur.getDate() + (weekly ? 7 : 1));
    }

    for (const row of data) {
      const day = parseLocalDate(row.bucket_date);
      if (!day) continue;
      const key = (weekly ? startOfWeek(day) : startOfDay(day)).getTime();
      const b = buckets.get(key);
      if (!b) continue;
      b.entered += Number(row.created) || 0;
      b.closed += Number(row.won) || 0;
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((b) => ({
        label: formatBucketLabel(b.date, weekly),
        Criadas: b.entered,
        Ganhas: b.closed,
      }));
  }, [data, from, to, weekly]);


  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Criadas x Ganhas
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {weekly ? 'Agregação semanal' : 'Agregação diária'}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          {([
            { value: 'daily' as Granularity, label: 'Diária' },
            { value: 'weekly' as Granularity, label: 'Semanal' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGranularity(opt.value)}
              aria-pressed={granularity === opt.value}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                granularity === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>


      {loading ? (
        <div className="h-64 animate-pulse rounded-md bg-muted/50" />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Criadas" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Ganhas" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>

          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
