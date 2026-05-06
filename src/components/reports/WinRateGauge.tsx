interface WinRateGaugeProps {
  rate: number; // 0-100
  wonCount: number;
  lostCount: number;
  loading?: boolean;
}

export function WinRateGauge({ rate, wonCount, lostCount, loading }: WinRateGaugeProps) {
  const safeRate = Math.max(0, Math.min(100, rate));
  const radius = 84;
  const strokeWidth = 16;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - safeRate / 100);

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
          <div className="flex h-full items-center justify-center">
            <div className="relative h-44 w-full max-w-[260px]">
              <svg viewBox="0 0 220 140" className="h-full w-full overflow-visible">
                <path
                  d="M 26 110 A 84 84 0 0 1 194 110"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
                <path
                  d="M 26 110 A 84 84 0 0 1 194 110"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              </svg>

              <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center">
                <div className="font-mono text-4xl font-semibold text-foreground">
                  {safeRate.toFixed(1)}
                  <span className="text-xl text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>
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
