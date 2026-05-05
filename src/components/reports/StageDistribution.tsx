import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

export interface StageSlice {
  name: string;
  value: number;
}

interface Props {
  data: StageSlice[];
  formatCurrency: (n: number) => string;
  loading?: boolean;
}

const PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--accent))',
  'hsl(var(--secondary))',
];

export function StageDistribution({ data, formatCurrency, loading }: Props) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Distribuição por etapa</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Valor aberto por estágio</p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded bg-muted" />
      ) : filtered.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Sem oportunidades abertas
        </div>
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={filtered}
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                {filtered.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total
            </span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
