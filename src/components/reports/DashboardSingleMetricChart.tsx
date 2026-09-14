import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { GranularityToggle } from './GranularityToggle';
import {
  buildTrendBuckets,
  defaultGranularityFor,
  type Granularity,
  type TrendBucketRow,
} from './trendBuckets';

type Metric = 'created' | 'won' | 'conversion';

interface Props {
  data: TrendBucketRow[];
  from: Date;
  to: Date;
  loading?: boolean;
  title: string;
  metric: Metric;
  variant?: 'bar' | 'line';
}

const COLOR: Record<Metric, string> = {
  created: 'hsl(var(--info))',
  won: 'hsl(var(--success))',
  conversion: 'hsl(var(--orange))',
};

export function DashboardSingleMetricChart({
  data,
  from,
  to,
  loading,
  title,
  metric,
  variant = 'bar',
}: Props) {
  const defaultGranularity = useMemo(() => defaultGranularityFor(from, to), [from, to]);
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  useEffect(() => setGranularity(defaultGranularity), [defaultGranularity]);

  const weekly = granularity === 'weekly';
  const isPercent = metric === 'conversion';
  const color = COLOR[metric];

  const series = useMemo(() => {
    return buildTrendBuckets(data, from, to, weekly).map((b) => ({
      label: b.label,
      value:
        metric === 'created'
          ? b.created
          : metric === 'won'
            ? b.won
            : b.created > 0
              ? (b.won / b.created) * 100
              : null,
    }));
  }, [data, from, to, weekly, metric]);

  const tooltipProps = {
    cursor: variant === 'bar'
      ? ({ fill: 'hsl(var(--muted))', opacity: 0.4 } as const)
      : ({ stroke: 'hsl(var(--border))' } as const),
    contentStyle: {
      background: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 6,
      fontSize: 12,
      color: 'hsl(var(--popover-foreground))',
    },
    formatter: (v: number | null) =>
      [v == null ? '—' : isPercent ? `${v.toFixed(2)}%` : String(v), title] as [string, string],
  };

  const axisTick = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };
  const axisLine = { stroke: 'hsl(var(--border))' };
  const margin = { top: 8, right: 12, left: -16, bottom: 0 };

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {weekly ? 'Agregação semanal' : 'Agregação diária'}
          </p>
        </div>
        <GranularityToggle value={granularity} onChange={setGranularity} />
      </div>

      {loading ? (
        <div className="h-56 animate-pulse rounded-md bg-muted/50" />
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {variant === 'line' ? (
              <LineChart data={series} margin={margin}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} />
                <YAxis
                  tick={axisTick}
                  tickLine={false}
                  axisLine={axisLine}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip {...tooltipProps} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 2, fill: color }}
                  connectNulls={false}
                />
              </LineChart>
            ) : (
              <BarChart data={series} margin={margin} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={axisLine} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
