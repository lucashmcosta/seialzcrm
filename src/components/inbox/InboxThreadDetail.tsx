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
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Check, ArrowCounterClockwise } from '@phosphor-icons/react';
import type { InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';

interface Props {
  threadId: string | null;
  onThreadStatusChanged?: () => void;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';
}

export function InboxThreadDetail({ threadId, onThreadStatusChanged }: Props) {
  const { thread, history, latestWonOpportunity, loading, refresh } = useInboxThread(threadId);
  const { organization } = useOrganizationContext();
  const { toast } = useToast();
  const [replyTo, setReplyTo] = useState<InboxMessageRow | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirmResolveOpen, setConfirmResolveOpen] = useState(false);

  async function handleResolve() {
    if (!thread) return;
    setResolving(true);
    try {
      const { error } = await supabase
        .from('message_threads')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', thread.id);
      if (error) throw error;
      toast({ description: 'Conversa resolvida.' });
      refresh();
      onThreadStatusChanged?.();
    } catch (e: any) {
      console.error('[inbox-detail] resolve failed', e);
      toast({ variant: 'destructive', description: e?.message || 'Falha ao resolver.' });
    } finally {
      setResolving(false);
      setConfirmResolveOpen(false);
    }
  }

  async function handleReopen() {
    if (!thread) return;
    setResolving(true);
    try {
      const { error } = await supabase
        .from('message_threads')
        .update({ status: 'open', resolved_at: null })
        .eq('id', thread.id);
      if (error) throw error;
      toast({ description: 'Conversa reaberta.' });
      refresh();
      onThreadStatusChanged?.();
    } catch (e: any) {
      console.error('[inbox-detail] reopen failed', e);
      toast({ variant: 'destructive', description: e?.message || 'Falha ao reabrir.' });
    } finally {
      setResolving(false);
    }
  }

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
      {/* Coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border px-6 py-3 flex-shrink-0 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0 ring-1 ring-primary/10 mt-0.5">
            {initials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground truncate leading-tight" title={name}>{name}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {lifecycle === 'customer' && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-sky-500/15 text-sky-700 dark:text-sky-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  Cliente
                </span>
              )}
              {endpointPurpose && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {endpointPurpose}
                </span>
              )}
              <WhatsAppWindowChip
                channel={thread.channel}
                lastInboundAt={thread.last_inbound_at || thread.whatsapp_last_inbound_at || null}
              />
              <InboxSlaChip targetAt={thread.sla_first_response_target_at} firstResponseAt={thread.first_response_at} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {thread.status && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 capitalize flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {thread.status === 'open' ? 'Aberta' : thread.status === 'pending' ? 'Aguardando' : thread.status === 'resolved' ? 'Resolvida' : thread.status === 'closed' ? 'Fechada' : thread.status}
              </span>
            )}
            {thread.status === 'resolved' || thread.status === 'closed' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReopen}
                disabled={resolving}
                className="h-7 px-2.5 text-xs gap-1 flex-shrink-0"
              >
                <ArrowCounterClockwise size={14} weight="bold" />
                Reabrir
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmResolveOpen(true)}
                disabled={resolving}
                className="h-7 px-2.5 text-xs gap-1 flex-shrink-0"
              >
                <Check size={14} weight="bold" />
                Resolver
              </Button>
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

      {/* Painel lateral */}
      <aside className="w-[300px] border-l border-border overflow-y-auto flex-shrink-0">
        <div className="px-5 py-6 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Atendimento</h3>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-xs">
              <dt className="text-muted-foreground">Tipo</dt>
              <dd className="text-foreground">{lifecycle === 'customer' ? 'Cliente' : (lifecycle || '—')}</dd>
              <dt className="text-muted-foreground">Origem</dt>
              <dd className="text-foreground truncate" title={latestWonOpportunity?.title || undefined}>
                {latestWonOpportunity ? `Oportunidade · ${latestWonOpportunity.title}` : '—'}
              </dd>
              {latestWonOpportunity && (
                <>
                  <dt className="text-muted-foreground">Convertido em</dt>
                  <dd className="text-foreground">{fmt(latestWonOpportunity.close_date || latestWonOpportunity.updated_at)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Endpoint</dt>
              <dd className="text-foreground">{endpointPurpose || '—'}</dd>
            </dl>
          </section>

          <div className="h-px bg-border" />

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Dados da conversa</h3>

            <div className="mb-4">
              <div className="text-[11px] text-muted-foreground mb-1.5">Atribuída a</div>
              <OwnerSelector
                value={thread.assigned_user_id || null}
                onChange={handleAssign}
                size="sm"
                placeholder={reassigning ? 'Atribuindo…' : 'Sem responsável'}
              />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
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

          <div className="h-px bg-border" />

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Histórico de atribuição</h3>
            <InboxAssignmentHistory history={history} />
          </section>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmResolveOpen}
        onOpenChange={setConfirmResolveOpen}
        title="Resolver conversa"
        description="Esta conversa será marcada como resolvida e sairá da fila ativa. Você pode reabri-la a qualquer momento."
        confirmText="Resolver"
        onConfirm={handleResolve}
        loading={resolving}
      />
    </div>
  );
}
