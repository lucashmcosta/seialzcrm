import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/hooks/useOrganization';
import { useNammuxHearingCheck, useNammuxHearingCheckFlagState } from '@/hooks/useNammuxHearingCheck';
import {
  groupByKind, KIND_TITLE, problemText, todayInSaoPaulo, whenLabel, type HearingCheckItem, type HearingCheckKind,
} from '@/lib/nammuxHearingCheck';

const KIND_HELP: Record<HearingCheckKind, string> = {
  hora_diferente: 'O cliente tem uma hora na cabeça e a audiência é em outra.',
  data_mudou: 'O cliente pode ir a uma audiência que não vai acontecer, ou perder a nova data.',
  sem_aviso: 'Pode ter sido avisado por ligação ou de outro jeito. Vale conferir, começando pelas mais próximas.',
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null;

function Card({ item, today }: { item: HearingCheckItem; today: string }) {
  const soon = whenLabel(item.kind === 'data_mudou' ? item.toldDay : item.eventDay, today);
  const told = when(item.toldAt);
  const last = when(item.lastOutboundAt);
  return (
    <article className="rounded-md border border-border bg-card p-4 space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">
            <Link to={`/contacts/${item.contactId}`} className="hover:underline">{item.contactName || 'Cliente'}</Link>
          </div>
          {item.cnj && <div className="text-xs text-muted-foreground">Processo {item.cnj}</div>}
        </div>
        <div className="flex items-center gap-2">
          {soon && <Badge variant={soon === 'hoje' || soon === 'amanhã' ? 'destructive' : 'secondary'}>{soon}</Badge>}
          {item.opportunityId && (
            <Link to={`/opportunities/${item.opportunityId}`} className="text-xs text-primary hover:underline">Abrir negócio</Link>
          )}
        </div>
      </header>
      <p className="text-sm">{problemText(item)}</p>
      <p className="text-xs text-muted-foreground">
        {told ? `Aviso enviado em ${told}. ` : ''}
        {last ? `Última mensagem nossa em ${last}.` : 'Nenhuma mensagem nossa nos últimos meses.'}
      </p>
    </article>
  );
}

export default function NammuxHearingCheckPage() {
  const { organization } = useOrganization();
  const flag = useNammuxHearingCheckFlagState(organization?.id);
  const { data, isLoading, error } = useNammuxHearingCheck(organization?.id, flag.enabled);
  const today = todayInSaoPaulo();
  const groups = useMemo(() => groupByKind(data ?? []), [data]);

  // Sem a flag da organização a tela não existe. Só decide depois de a flag responder.
  if (organization && flag.resolved && !flag.enabled) {
    return <Navigate to="/inbox" replace />;
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Audiências: o que o cliente ouviu</h1>
          <p className="text-sm text-muted-foreground">
            Compara a agenda do processo com a última data e hora que escrevemos ao cliente. Mostra as audiências dos
            próximos 15 dias e as datas avisadas que mudaram depois.
          </p>
        </header>

        {isLoading && <div className="text-sm text-muted-foreground">Conferindo as conversas…</div>}
        {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}

        {data && groups.length === 0 && (
          <div className="text-sm text-muted-foreground">Tudo confere: nenhuma audiência próxima com aviso faltando ou diferente.</div>
        )}

        {groups.map((g) => (
          <section key={g.kind} className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">{KIND_TITLE[g.kind]} ({g.items.length})</h2>
              <p className="text-xs text-muted-foreground">{KIND_HELP[g.kind]}</p>
            </div>
            {g.items.map((item, idx) => (
              <Card key={`${item.kind}-${item.contactId}-${item.eventDay ?? item.toldDay}-${idx}`} item={item} today={today} />
            ))}
          </section>
        ))}
      </div>
    </Layout>
  );
}
