import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatSeconds } from '@/lib/format-duration';
import { useServiceWorstResponses } from '@/hooks/useServiceWorstResponses';

interface Props {
  open: boolean;
  onClose: () => void;
  kind: 'first' | 'all';
  organizationId: string | null | undefined;
  from: Date;
  to: Date;
  ownerId: string;
}

const fmtDateTime = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  if (!isFinite(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function ServiceResponseDetailDialog({
  open,
  onClose,
  kind,
  organizationId,
  from,
  to,
  ownerId,
}: Props) {
  const { rows, stats, loading } = useServiceWorstResponses({
    organizationId,
    from,
    to,
    ownerId,
    kind,
    enabled: open,
  });

  const title =
    kind === 'first'
      ? 'Tempo médio 1ª resposta — piores casos'
      : 'Tempo médio de resposta — piores casos';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 border-b border-border pb-4">
          <Stat label="Mediana (p50)" value={formatSeconds(stats.median)} hint={`${stats.count} respostas`} />
          <Stat label="p90" value={formatSeconds(stats.p90)} />
          <Stat label="Máximo" value={formatSeconds(stats.max)} />
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted/50" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sem dados no período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-2 font-medium">Contato</th>
                  <th className="py-2 pr-2 font-medium">Responsável</th>
                  <th className="py-2 pr-2 font-medium">Inbound</th>
                  <th className="py-2 pr-2 font-medium">Outbound</th>
                  <th className="py-2 pr-2 text-right font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50"
                  >
                    <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2 font-medium text-foreground">
                      {r.contact_name || '(sem nome)'}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {r.user_name || '—'}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
                      {fmtDateTime(r.inbound_at)}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
                      {fmtDateTime(r.outbound_at)}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono font-semibold text-warning">
                      {formatSeconds(r.response_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
