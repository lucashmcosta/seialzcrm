import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface TrendPoint {
  date: string;
  created: number;
  won: number;
  wonValue: number;
}

interface Props {
  data: TrendPoint[];
  formatCurrency: (n: number) => string;
  loading?: boolean;
}

export function SalesTrendChart({ data, formatCurrency, loading }: Props) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Evolução no período</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Oportunidades criadas, ganhas e valor ganho
        </p>
      </div>

      {loading ? (
        <div className="h-72 animate-pulse rounded bg-muted" />
      ) : data.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Sem dados no período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={288}>
          <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrency(v).replace(/[^\d.,KMB ]/g, '')}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => {
                if (name === 'wonValue') return [formatCurrency(value), 'Valor ganho'];
                if (name === 'won') return [value, 'Ganhas'];
                if (name === 'created') return [value, 'Criadas'];
                return [value, name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(v) =>
                v === 'created' ? 'Criadas' : v === 'won' ? 'Ganhas' : 'Valor ganho'
              }
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="created"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#gCreated)"
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="won"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              fill="url(#gWon)"
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="wonValue"
              stroke="hsl(var(--warning))"
              strokeWidth={2}
              fill="url(#gValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
