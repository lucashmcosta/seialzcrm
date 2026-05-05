import { cn } from '@/lib/utils';

export interface FunnelStage {
  name: string;
  count: number;
  value: number;
}

interface Props {
  stages: FunnelStage[];
  formatCurrency: (n: number) => string;
  loading?: boolean;
}

export function PipelineFunnel({ stages, formatCurrency, loading }: Props) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Funil do Pipeline</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Oportunidades abertas por etapa
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma etapa configurada
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((stage, i) => {
            const widthPct = (stage.count / max) * 100;
            return (
              <div key={i} className="group">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-medium text-foreground">
                    {stage.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {stage.count} · {formatCurrency(stage.value)}
                  </span>
                </div>
                <div className="h-7 overflow-hidden rounded-md bg-muted/50">
                  <div
                    className={cn(
                      'h-full rounded-md transition-all duration-500',
                      'bg-gradient-to-r from-primary/80 to-primary',
                    )}
                    style={{ width: `${Math.max(widthPct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
