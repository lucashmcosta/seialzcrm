import { useInboxThread } from '@/hooks/inbox/useInboxThread';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { InboxSlaChip } from './InboxSlaChip';
import { InboxAssignmentHistory } from './InboxAssignmentHistory';
import { InboxConversationTimeline } from './InboxConversationTimeline';

interface Props {
  threadId: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function InboxThreadDetail({ threadId }: Props) {
  const { thread, history, loading } = useInboxThread(threadId);
  const { organization } = useOrganizationContext();

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
    <div className="flex-1 flex bg-background min-w-0">
      {/* Coluna principal: header + timeline read-only */}
      <div className="flex-1 flex flex-col min-w-0">
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
        </div>

        <InboxConversationTimeline threadId={thread.id} organizationId={organization?.id} />
      </div>

      {/* Painel lateral: dados + histórico de atribuição */}
      <aside className="w-[320px] border-l border-border overflow-y-auto flex-shrink-0">
        <div className="p-5 space-y-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dados da conversa</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
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
                <dt className="text-muted-foreground">1ª resposta</dt>
                <dd className="text-foreground">{fmt(thread.first_response_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">SLA 1ª resp.</dt>
                <dd className="text-foreground">{fmt(thread.sla_first_response_target_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">SLA resolução</dt>
                <dd className="text-foreground">{fmt(thread.sla_resolution_target_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Resolvida</dt>
                <dd className="text-foreground">{fmt(thread.resolved_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Última msg</dt>
                <dd className="text-foreground">{fmt(thread.last_message_at)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Histórico de atribuição</h3>
            <InboxAssignmentHistory history={history} />
          </section>
        </div>
      </aside>
    </div>
  );
}
