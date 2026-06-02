import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useInboxThread } from '@/hooks/inbox/useInboxThread';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { InboxSlaChip } from './InboxSlaChip';
import { InboxAssignmentHistory } from './InboxAssignmentHistory';
import { InboxConversationTimeline } from './InboxConversationTimeline';
import { InboxComposer } from './InboxComposer';
import { WhatsAppWindowChip } from './WhatsAppWindowChip';
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
  const { thread, history, latestWonOpportunity, loading, refresh } = useInboxThread(threadId);
  const { organization } = useOrganizationContext();
  const { toast } = useToast();
  const [replyTo, setReplyTo] = useState<InboxMessageRow | null>(null);
  const [reassigning, setReassigning] = useState(false);

  async function handleAssign(userId: string | null) {
    if (!thread) return;
    setReassigning(true);
    try {
      const { error } = await supabase
        .from('message_threads')
        .update({
          assigned_user_id: userId,
          assigned_at: userId ? new Date().toISOString() : null,
          last_routing_decision: {
            action: 'manual_assignment',
            by_user_id: userId,
            reason: userId ? 'inbox_manual_reassign' : 'inbox_unassign',
            at: new Date().toISOString(),
          },
        })
        .eq('id', thread.id);
      if (error) throw error;
      toast({ description: userId ? 'Conversa reatribuída.' : 'Conversa devolvida à fila.' });
      refresh();
    } catch (e: any) {
      console.error('[inbox-detail] reassign failed', e);
      toast({ variant: 'destructive', description: e?.message || 'Falha ao reatribuir.' });
    } finally {
      setReassigning(false);
    }
  }


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
            <WhatsAppWindowChip
              channel={thread.channel}
              lastInboundAt={thread.last_inbound_at || thread.whatsapp_last_inbound_at || null}
            />
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

            <div className="mb-3">
              <div className="text-[11px] text-muted-foreground mb-1">Atribuída a</div>
              <OwnerSelector
                value={thread.assigned_user_id || null}
                onChange={handleAssign}
                size="sm"
                placeholder={reassigning ? 'Atribuindo…' : 'Sem responsável'}
              />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Canal</dt>
                <dd className="text-foreground">{thread.channel || '—'}</dd>
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
