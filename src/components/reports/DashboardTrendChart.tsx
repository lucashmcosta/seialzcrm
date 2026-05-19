import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface OppPoint {
  created_at: string;
  status: string;
  updated_at: string;
  close_date?: string | null;
}

const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

interface Props {
  data: OppPoint[];
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

export function DashboardTrendChart({ data, from, to, loading }: Props) {
  const { series, weekly } = useMemo(() => {
    const days = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;
    const weekly = days > 90;
    const buckets = new Map<number, { entered: number; closed: number; date: Date }>();

    const start = weekly ? startOfWeek(from) : startOfDay(from);
    const end = weekly ? startOfWeek(to) : startOfDay(to);
    for (let cur = new Date(start); cur <= end; ) {
      buckets.set(cur.getTime(), { entered: 0, closed: 0, date: new Date(cur) });
      cur.setDate(cur.getDate() + (weekly ? 7 : 1));
    }

    const fromMs = from.getTime();
    const toMs = to.getTime();

    for (const opp of data) {
      const created = new Date(opp.created_at);
      if (created.getTime() >= fromMs && created.getTime() <= toMs) {
        const key = (weekly ? startOfWeek(created) : startOfDay(created)).getTime();
        const b = buckets.get(key);
        if (b) b.entered += 1;
      }
      if (opp.status === 'won' && opp.close_date) {
        const updated = parseLocalDate(opp.close_date);
        if (updated && updated.getTime() >= fromMs && updated.getTime() <= toMs) {
          const key = (weekly ? startOfWeek(updated) : startOfDay(updated)).getTime();
          const b = buckets.get(key);
          if (b) b.closed += 1;
        }
      }
    }

    const series = Array.from(buckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((b) => ({
        label: formatBucketLabel(b.date, weekly),
        Entradas: b.entered,
        Fechamentos: b.closed,
      }));

    return { series, weekly };
  }, [data, from, to]);

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          Entradas x Fechamentos
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {weekly ? 'Agregação semanal' : 'Agregação diária'}
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-md bg-muted/50" />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="Entradas"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Fechamentos"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
