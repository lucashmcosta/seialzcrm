import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Warning, Archive } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';

type SnapDoc = { label: string; status: string; satisfied_by?: Array<{ display_name?: string }> };

// Registro de fechamento (3d-3): mostra, quando a oportunidade foi ganha, qual regra de
// documentos valia e QUAL documento satisfez cada exigência (rastro de auditoria/export).
export function CloseSnapshotCard({ opportunityId }: { opportunityId: string }) {
  const { data } = useQuery({
    queryKey: ['opp-close-snapshot', opportunityId],
    enabled: !!opportunityId,
    queryFn: async () => {
      // Tabela nova (3d-3) ainda fora do types.ts gerado — cast localizado.
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
        };
      })
        .from('opportunity_close_snapshots')
        .select('closed_at,mode,documents')
        .eq('opportunity_id', opportunityId)
        .maybeSingle();
      return data as { closed_at: string; mode: string | null; documents: SnapDoc[] } | null;
    },
  });
  if (!data) return null;
  const docs = (data.documents ?? []).filter(Boolean);
  const when = (() => {
    try { return new Date(data.closed_at).toLocaleString('pt-BR'); } catch { return data.closed_at; }
  })();

  return (
    <Card className="p-4 sm:p-6 space-y-3 border-dashed">
      <div className="flex items-center gap-2">
        <Archive className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Registro de fechamento</h3>
        <span className="text-xs text-muted-foreground">· ganho em {when}</span>
      </div>
      {docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum documento era exigido na regra vigente ao fechar.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {docs.map((d, i) => {
            const names = (d.satisfied_by ?? []).map((s) => s.display_name).filter(Boolean) as string[];
            return (
              <div key={i} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{names.length ? names.join(', ') : '— sem documento no registro'}</p>
                </div>
                {d.status === 'passed' ? (
                  <Badge variant="outline" className="gap-1 text-[10px] shrink-0"><CheckCircle className="h-3 w-3 text-green-500" />Atendido</Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-[10px] shrink-0"><Warning className="h-3 w-3" />Não atendido</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
