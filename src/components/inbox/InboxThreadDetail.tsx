import { useInboxThread } from '@/hooks/inbox/useInboxThread';
import { InboxSlaChip } from './InboxSlaChip';
import { InboxAssignmentHistory } from './InboxAssignmentHistory';

interface Props {
  threadId: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function InboxThreadDetail({ threadId }: Props) {
  const { thread, history, loading } = useInboxThread(threadId);

  if (!threadId) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Selecione uma conversa para ver os detalhes.
      </div>
    );
  }
  if (loading && !thread) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!thread) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Conversa não encontrada.</div>;
  }

  const name = thread.contact?.name || thread.contact?.phone || 'Sem contato';

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      <div className="h-14 border-b border-border flex items-center px-6 gap-3 flex-shrink-0">
        <h2 className="text-base font-semibold text-foreground truncate">{name}</h2>
        <InboxSlaChip targetAt={thread.sla_first_response_target_at} firstResponseAt={thread.first_response_at} />
        {thread.status && (
          <span className="font-data text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {thread.status}
          </span>
        )}
        {thread.priority && (
          <span className="font-data text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {thread.priority}
          </span>
        )}
        <div className="ml-auto text-[11px] text-muted-foreground italic">
          Fase 1 — somente leitura
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dados da conversa</h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Canal</dt>
              <dd className="text-foreground">{thread.channel || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Atribuída a</dt>
              <dd className="text-foreground font-mono">{thread.assigned_user_id?.slice(0, 8) || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Atribuída em</dt>
              <dd className="text-foreground">{fmt(thread.assigned_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Primeira resposta</dt>
              <dd className="text-foreground">{fmt(thread.first_response_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">SLA 1ª resposta</dt>
              <dd className="text-foreground">{fmt(thread.sla_first_response_target_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">SLA resolução</dt>
              <dd className="text-foreground">{fmt(thread.sla_resolution_target_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Resolvida em</dt>
              <dd className="text-foreground">{fmt(thread.resolved_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Última mensagem</dt>
              <dd className="text-foreground">{fmt(thread.last_message_at)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Histórico de atribuição</h3>
          <InboxAssignmentHistory history={history} />
        </section>
      </div>
    </div>
  );
}
