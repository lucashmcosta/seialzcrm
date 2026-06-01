import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useInboxThread } from '@/hooks/inbox/useInboxThread';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { InboxSlaChip } from './InboxSlaChip';
import { InboxAssignmentHistory } from './InboxAssignmentHistory';
import { InboxConversationTimeline } from './InboxConversationTimeline';
import { InboxComposer } from './InboxComposer';
import { OwnerSelector } from '@/components/common/OwnerSelector';
import type { InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';

interface Props {
  threadId: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function InboxThreadDetail({ threadId }: Props) {
  const { thread, history, loading, refresh } = useInboxThread(threadId);
  const { organization } = useOrganizationContext();
  const [replyTo, setReplyTo] = useState<InboxMessageRow | null>(null);

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

  const lifecycle = thread.contact?.lifecycle_stage;
  const endpointPurpose = thread.primary_endpoint?.purpose;

  return (
    <div className="flex-1 flex bg-background min-w-0">
      {/* Coluna principal: header + timeline read-only */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border px-6 py-1.5 flex-shrink-0 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate leading-tight" title={name}>{name}</h2>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {[
                lifecycle === 'customer' ? 'customer' : null,
                endpointPurpose ? `endpoint: ${endpointPurpose}` : null,
                'somente leitura',
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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
        </div>

        <InboxConversationTimeline
          threadId={thread.id}
          organizationId={organization?.id}
          contactName={thread.contact?.name || undefined}
          onReply={(m) => setReplyTo(m)}
        />

        <InboxComposer
          thread={thread as any}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onSent={() => { setReplyTo(null); refresh(); }}
          onThreadMutated={refresh}
        />
      </div>

      {/* Painel lateral: dados + histórico de atribuição */}
      <aside className="w-[280px] border-l border-border overflow-y-auto flex-shrink-0">
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
