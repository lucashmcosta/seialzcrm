import { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

interface OppPoint {
  created_at: string;
  status: string;
}

interface Props {
  data: OppPoint[];
  from: Date;
  to: Date;
  loading?: boolean;
}

const STATUS_META = [
  { key: 'open', label: 'Abertas', color: 'hsl(var(--primary))' },
  { key: 'won', label: 'Ganhas', color: 'hsl(var(--success))' },
  { key: 'lost', label: 'Perdidas', color: 'hsl(var(--destructive))' },
];

export function DashboardStatusDonut({ data, from, to, loading }: Props) {
  const { slices, total } = useMemo(() => {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const counts: Record<string, number> = { open: 0, won: 0, lost: 0 };

    for (const opp of data) {
      const created = new Date(opp.created_at).getTime();
      if (created < fromMs || created > toMs) continue;
      const s = opp.status === 'won' || opp.status === 'lost' ? opp.status : 'open';
      counts[s] = (counts[s] || 0) + 1;
    }

    const slices = STATUS_META.map((m) => ({
      name: m.label,
      value: counts[m.key] || 0,
      color: m.color,
    }));
    const total = slices.reduce((a, b) => a + b.value, 0);
    return { slices, total };
  }, [data, from, to]);

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Status</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Oportunidades criadas no período
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-md bg-muted/50" />
      ) : total === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Sem dados no período
        </div>
      ) : (
        <div className="relative h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              >
                {slices.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-foreground">{total}</span>
            <span className="text-xs text-muted-foreground">total</span>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-muted-foreground">{s.name}</span>
            </div>
            <span className="font-mono text-foreground">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
