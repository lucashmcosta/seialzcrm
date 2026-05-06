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

const CHART_HEIGHT = 288;
const CHART_WIDTH = 860;
const PADDING_X = 18;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 34;

function buildAreaPath(values: number[], maxValue: number) {
  if (values.length === 0) return '';

  const innerWidth = CHART_WIDTH - PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = PADDING_X + index * step;
    const y = PADDING_TOP + innerHeight - (maxValue === 0 ? 0 : (value / maxValue) * innerHeight);
    return { x, y };
  });

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const area = `${line} L ${points[points.length - 1].x.toFixed(2)} ${(CHART_HEIGHT - PADDING_BOTTOM).toFixed(2)} L ${points[0].x.toFixed(2)} ${(CHART_HEIGHT - PADDING_BOTTOM).toFixed(2)} Z`;

  return area;
}

export function SalesTrendChart({ data, formatCurrency, loading }: Props) {
  const createdMax = Math.max(...data.map((point) => point.created), 0);
  const wonMax = Math.max(...data.map((point) => point.won), 0);
  const valueMax = Math.max(...data.map((point) => point.wonValue), 0);
  const combinedMax = Math.max(createdMax, wonMax, valueMax, 1);

  const createdArea = buildAreaPath(
    data.map((point) => point.created),
    combinedMax,
  );
  const wonArea = buildAreaPath(
    data.map((point) => point.won),
    combinedMax,
  );
  const valueArea = buildAreaPath(
    data.map((point) => point.wonValue),
    combinedMax,
  );

  const peak = data.reduce<TrendPoint | null>((best, point) => {
    if (!best || point.wonValue > best.wonValue) return point;
    return best;
  }, null);

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Evolução no período</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Oportunidades criadas, ganhas e valor ganho
          </p>
        </div>
        {!loading && peak && data.length > 0 && (
          <div className="text-right text-xs text-muted-foreground">
            <span className="block">Pico de receita</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatCurrency(peak.wonValue)}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-72 animate-pulse rounded bg-muted" />
      ) : data.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Sem dados no período
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-md border border-border/60 bg-background/40 p-3">
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-72 w-full" role="img" aria-label="Evolução das oportunidades no período">
              <defs>
                <linearGradient id="reports-created" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.04" />
                </linearGradient>
                <linearGradient id="reports-won" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity="0.04" />
                </linearGradient>
                <linearGradient id="reports-value" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity="0.04" />
                </linearGradient>
              </defs>

              {[0, 1, 2, 3].map((step) => {
                const y = PADDING_TOP + ((CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM) / 3) * step;
                return (
                  <line
                    key={step}
                    x1={PADDING_X}
                    y1={y}
                    x2={CHART_WIDTH - PADDING_X}
                    y2={y}
                    stroke="hsl(var(--border))"
                    strokeDasharray="4 6"
                    strokeOpacity="0.75"
                  />
                );
              })}

              <path d={createdArea} fill="url(#reports-created)" stroke="hsl(var(--primary))" strokeWidth="2.5" />
              <path d={wonArea} fill="url(#reports-won)" stroke="hsl(var(--success))" strokeWidth="2.5" />
              <path d={valueArea} fill="url(#reports-value)" stroke="hsl(var(--warning))" strokeWidth="2.5" />
            </svg>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {data.map((point) => (
                <div key={point.date} className="rounded-md border border-border/60 bg-background/40 p-3">
                  <div className="text-xs font-medium text-foreground">{point.date}</div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>Criadas</span>
                      <span className="font-mono text-foreground">{point.created}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Ganhas</span>
                      <span className="font-mono text-success">{point.won}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Valor</span>
                      <span className="font-mono text-warning">{formatCurrency(point.wonValue)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid min-w-[180px] gap-2 rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                <span>Criadas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
                <span>Ganhas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                <span>Valor ganho</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}