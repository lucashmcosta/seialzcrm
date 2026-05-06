export interface StageSlice {
  name: string;
  value: number;
}

interface Props {
  data: StageSlice[];
  formatCurrency: (n: number) => string;
  loading?: boolean;
}

const TOKEN_COLORS = ['bg-primary', 'bg-success', 'bg-warning', 'bg-destructive', 'bg-accent', 'bg-secondary'];

export function StageDistribution({ data, formatCurrency, loading }: Props) {
  const filtered = data.filter((item) => item.value > 0);
  const total = filtered.reduce((sum, item) => sum + item.value, 0);

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
        <div className="space-y-4">
          <div className="overflow-hidden rounded-full bg-muted/60">
            <div className="flex h-5 w-full">
              {filtered.map((item, index) => {
                const width = total === 0 ? 0 : (item.value / total) * 100;
                return (
                  <div
                    key={item.name}
                    className={TOKEN_COLORS[index % TOKEN_COLORS.length]}
                    style={{ width: `${width}%` }}
                    aria-hidden="true"
                  />
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="font-mono text-lg font-semibold text-foreground">
                {formatCurrency(total)}
              </span>
            </div>

            <div className="space-y-3">
              {filtered.map((item, index) => {
                const percentage = total === 0 ? 0 : (item.value / total) * 100;
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${TOKEN_COLORS[index % TOKEN_COLORS.length]}`} />
                        <span className="truncate text-foreground">{item.name}</span>
                      </div>
                      <span className="font-mono text-muted-foreground">{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{formatCurrency(item.value)}</span>
                      <span>{item.value.toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}