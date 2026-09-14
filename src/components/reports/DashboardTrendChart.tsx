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
import { GranularityToggle } from './GranularityToggle';
import {
  buildTrendBuckets,
  defaultGranularityFor,
  type Granularity,
  type TrendBucketRow,
} from './trendBuckets';

interface Props {
  data: TrendBucketRow[];
  from: Date;
  to: Date;
  loading?: boolean;
}

export function DashboardTrendChart({ data, from, to, loading }: Props) {
  const defaultGranularity = useMemo(() => defaultGranularityFor(from, to), [from, to]);

  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);

  useEffect(() => {
    setGranularity(defaultGranularity);
  }, [defaultGranularity]);

  const weekly = granularity === 'weekly';

  const series = useMemo(
    () =>
      buildTrendBuckets(data, from, to, weekly).map((b) => ({
        label: b.label,
        Criadas: b.created,
        Ganhas: b.won,
      })),
    [data, from, to, weekly],
  );

  return (
    <div className="flex h-full flex-col rounded-md border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Criadas x Ganhas
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {weekly ? 'Agregação semanal' : 'Agregação diária'}
          </p>
        </div>
        <GranularityToggle value={granularity} onChange={setGranularity} />
      </div>

      {loading ? (
        <div className="min-h-64 flex-1 animate-pulse rounded-md bg-muted/50" />
      ) : (
        <div className="min-h-64 w-full flex-1">
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
