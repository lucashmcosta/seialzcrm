import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';

interface WinRateGaugeProps {
  rate: number; // 0-100
  wonCount: number;
  lostCount: number;
  loading?: boolean;
}

export function WinRateGauge({ rate, wonCount, lostCount, loading }: WinRateGaugeProps) {
  const data = [{ name: 'win', value: Math.max(0, Math.min(100, rate)) }];

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Win Rate</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Taxa de conversão de oportunidades fechadas</p>

      <div className="relative mt-2 h-48">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="75%"
                outerRadius="100%"
                data={data}
                startAngle={180}
                endAngle={0}
                cy="80%"
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  dataKey="value"
                  cornerRadius={6}
                  fill="hsl(var(--primary))"
                  background={{ fill: 'hsl(var(--muted))' }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center">
              <div className="font-mono text-4xl font-semibold text-foreground">
                {rate.toFixed(1)}
                <span className="text-xl text-muted-foreground">%</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border pt-3">
        <div>
          <p className="text-xs text-muted-foreground">Ganhas</p>
          <p className="font-mono text-lg font-semibold text-success">{wonCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Perdidas</p>
          <p className="font-mono text-lg font-semibold text-destructive">{lostCount}</p>
        </div>
      </div>
    </div>
  );
}
