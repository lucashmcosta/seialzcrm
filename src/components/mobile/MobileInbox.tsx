import { useEffect, useMemo, useState } from 'react';
import { MobileLayout } from './MobileLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CaretLeft,
  MagnifyingGlass,
  SpinnerGap,
  Check,
  ArrowCounterClockwise,
  DotsThreeVertical,
  Info,
  UserCirclePlus,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

import { useInboxThreads, type InboxThreadRow } from '@/hooks/inbox/useInboxThreads';
import { useInboxQueueCounts } from '@/hooks/inbox/useInboxQueueCounts';
import { useInboxThread } from '@/hooks/inbox/useInboxThread';
import type { InboxTab } from '@/hooks/inbox/inboxScope';
import type { InboxMessageRow } from '@/hooks/inbox/useInboxThreadMessages';

import { InboxSlaChip } from '@/components/inbox/InboxSlaChip';
import { WhatsAppWindowChip } from '@/components/inbox/WhatsAppWindowChip';
import { InboxConversationTimeline } from '@/components/inbox/InboxConversationTimeline';
import { InboxComposer } from '@/components/inbox/InboxComposer';
import { InboxAssignmentHistory } from '@/components/inbox/InboxAssignmentHistory';
import { OwnerSelector } from '@/components/common/OwnerSelector';

// ─── Helpers ─────────────────────────────────────────────────────
function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';
}

const AVATAR_PALETTE = [
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
];

function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

const STATUS_MAP: Record<string, { label: string; cls: string; dot: string; pulse?: boolean }> = {
  open:     { label: 'Aberta',     cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', pulse: true },
  pending:  { label: 'Aguardando', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',       dot: 'bg-amber-500' },
  resolved: { label: 'Resolvida',  cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',       dot: 'bg-slate-500' },
  closed:   { label: 'Fechada',    cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',       dot: 'bg-slate-500' },
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function Pill({ children, cls, dot, pulse }: { children: React.ReactNode; cls: string; dot?: string; pulse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', cls)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot, pulse && 'animate-pulse')} />}
      {children}
    </span>
  );
}

const TABS: { id: InboxTab; label: string }[] = [
  { id: 'active', label: 'Ativos' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'resolved_today', label: 'Concluídos hoje' },
];

// ─── Component ───────────────────────────────────────────────────
export function MobileInbox() {
  const { user } = useAuth();
  const { organization } = useOrganizationContext();
  const { toast } = useToast();

  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>('active');
  const [onlyMine, setOnlyMine] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // Resolve internal users.id (Core rule)
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setInternalUserId(null); return; }
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!cancelled) setInternalUserId((data?.id as string) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const orgTimezone = organization?.timezone ?? null;
  const { counts, refresh: refreshCounts } = useInboxQueueCounts(internalUserId, onlyMine, orgTimezone);
  const { threads, loading, refresh: refreshThreads } = useInboxThreads(tab, onlyMine, internalUserId, orgTimezone);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const name = (t.contact?.name || '').toLowerCase();
      const phone = (t.contact?.phone || '').toLowerCase();
      const preview = (t.last_message_content || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || preview.includes(q);
    });
  }, [threads, search]);

  const inChat = !!selectedId;

  const handleAfterChange = () => {
    refreshCounts();
    refreshThreads();
  };

  return (
    <MobileLayout hideBottomBar={inChat}>
      {inChat ? (
        <ChatView
          threadId={selectedId!}
          onBack={() => setSelectedId(null)}
          onChanged={handleAfterChange}
          showDetails={showDetails}
          setShowDetails={setShowDetails}
        />
      ) : (
        <ListView
          tab={tab}
          setTab={(t) => { setTab(t); setSelectedId(null); }}
          counts={counts}
          onlyMine={onlyMine}
          setOnlyMine={(v) => { setOnlyMine(v); setSelectedId(null); }}
          search={search}
          setSearch={setSearch}
          threads={filtered}
          loading={loading}
          onSelect={setSelectedId}
        />
      )}
    </MobileLayout>
  );
}

// ─── List view ───────────────────────────────────────────────────
function ListView({
  tab, setTab, counts, onlyMine, setOnlyMine, search, setSearch, threads, loading, onSelect,
}: {
  tab: InboxTab;
  setTab: (t: InboxTab) => void;
  counts: { active: number; waiting: number; resolved_today: number };
  onlyMine: boolean;
  setOnlyMine: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  threads: InboxThreadRow[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Search + filters */}
      <div className="px-4 py-3 border-b border-border space-y-3 flex-shrink-0 bg-card">
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversa…"
            className="pl-9 h-10 rounded-full"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {TABS.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                <span className={cn('font-data text-[10px]', isActive ? 'opacity-90' : 'opacity-70')}>
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setOnlyMine(!onlyMine)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ml-1',
              onlyMine
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            Apenas minhas
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <SpinnerGap size={22} className="animate-spin" />
          </div>
        )}
        {!loading && threads.length === 0 && (
          <div className="p-10 text-center text-xs text-muted-foreground">
            Nenhuma conversa nesta fila.
          </div>
        )}
        {threads.map((t) => {
          const name = t.contact?.name || t.contact?.phone || 'Sem contato';
          const status = STATUS_MAP[t.status || ''];
          const isUnread = t.last_message_direction === 'inbound';
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-border block border-l-4 transition-colors',
                isUnread
                  ? 'border-l-emerald-500 bg-emerald-500/5 active:bg-emerald-500/10'
                  : 'border-l-transparent active:bg-muted',
              )}
            >
              <div className="flex gap-3">
                <div className={cn('h-11 w-11 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0', colorFromName(name))}>
                  {initials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      'text-sm truncate flex-1',
                      isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                    )}>{name}</span>
                    <span className={cn(
                      'font-data text-[10px]',
                      isUnread ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground',
                    )}>{relTime(t.last_message_at)}</span>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" aria-label="Não lida" />
                    )}
                  </div>
                  <div className={cn(
                    'text-xs line-clamp-2 mb-1.5',
                    isUnread ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {t.last_message_content || '—'}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <InboxSlaChip targetAt={t.sla_first_response_target_at} firstResponseAt={t.first_response_at} />
                    {status && <Pill cls={status.cls} dot={status.dot} pulse={status.pulse}>{status.label}</Pill>}
                    {t.contact?.lifecycle_stage === 'customer' && (
                      <Pill cls="bg-sky-500/15 text-sky-700 dark:text-sky-300" dot="bg-sky-500">Cliente</Pill>
                    )}
                    {!t.assigned_user_id && (
                      <Pill cls="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" dot="bg-yellow-500">Sem dono</Pill>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Chat view ───────────────────────────────────────────────────
function ChatView({
  threadId, onBack, onChanged, showDetails, setShowDetails,
}: {
  threadId: string;
  onBack: () => void;
  onChanged: () => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
}) {
  const { thread, history, latestWonOpportunity, loading, refresh } = useInboxThread(threadId);
  const { organization } = useOrganizationContext();
  const { toast } = useToast();
  const [replyTo, setReplyTo] = useState<InboxMessageRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  async function handleResolve() {
    if (!thread) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('message_threads')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', thread.id);
      if (error) throw error;
      toast({ description: 'Conversa resolvida.' });
      refresh();
      onChanged();
    } catch (e: any) {
      toast({ variant: 'destructive', description: e?.message || 'Falha ao resolver.' });
    } finally { setBusy(false); }
  }

  async function handleReopen() {
    if (!thread) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('message_threads')
        .update({ status: 'open', resolved_at: null })
        .eq('id', thread.id);
      if (error) throw error;
      toast({ description: 'Conversa reaberta.' });
      refresh();
      onChanged();
    } catch (e: any) {
      toast({ variant: 'destructive', description: e?.message || 'Falha ao reabrir.' });
    } finally { setBusy(false); }
  }

  async function handleAssign(userId: string | null) {
    if (!thread) return;
    setBusy(true);
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
      onChanged();
      setShowAssign(false);
    } catch (e: any) {
      toast({ variant: 'destructive', description: e?.message || 'Falha ao reatribuir.' });
    } finally { setBusy(false); }
  }

  if (loading && !thread) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <SpinnerGap size={22} className="animate-spin" />
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
        <div className="text-sm text-muted-foreground">Conversa não encontrada.</div>
        <Button variant="outline" size="sm" onClick={onBack}>Voltar</Button>
      </div>
    );
  }

  const name = thread.contact?.name || thread.contact?.phone || 'Sem contato';
  const lifecycle = thread.contact?.lifecycle_stage;
  const isResolvedLike = thread.status === 'resolved' || thread.status === 'closed';

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border bg-card flex-shrink-0">
        <button
          onClick={onBack}
          className="h-9 w-9 flex items-center justify-center rounded-full text-foreground active:bg-muted"
          aria-label="Voltar"
        >
          <CaretLeft size={20} weight="bold" />
        </button>
        <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0', colorFromName(name))}>
          {initials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{name}</div>
          <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden whitespace-nowrap">
            {lifecycle === 'customer' && (
              <Pill cls="bg-sky-500/15 text-sky-700 dark:text-sky-300" dot="bg-sky-500">Cliente</Pill>
            )}
            <WhatsAppWindowChip
              channel={thread.channel}
              lastInboundAt={thread.last_inbound_at || thread.whatsapp_last_inbound_at || null}
            />
          </div>
        </div>
        {isResolvedLike ? (
          <Button variant="ghost" size="sm" onClick={handleReopen} disabled={busy} className="h-9 w-9 p-0" title="Reabrir">
            <ArrowCounterClockwise size={18} weight="bold" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={handleResolve} disabled={busy} className="h-9 w-9 p-0" title="Resolver">
            <Check size={18} weight="bold" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-9 w-9 flex items-center justify-center rounded-full text-foreground active:bg-muted" aria-label="Mais">
              <DotsThreeVertical size={20} weight="bold" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => setShowAssign(true)}>
              <UserCirclePlus size={16} className="mr-2" /> Reatribuir
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowDetails(true)}>
              <Info size={16} className="mr-2" /> Detalhes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Timeline */}
      <InboxConversationTimeline
        threadId={thread.id}
        organizationId={organization?.id}
        contactName={thread.contact?.name || undefined}
        onReply={(m) => setReplyTo(m)}
      />

      {/* Composer */}
      <InboxComposer
        compact
        thread={thread as any}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSent={() => { setReplyTo(null); refresh(); onChanged(); }}
        onThreadMutated={() => { refresh(); onChanged(); }}
      />

      {/* Reatribuir sheet */}
      <Sheet open={showAssign} onOpenChange={setShowAssign}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Reatribuir conversa</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <OwnerSelector
              value={thread.assigned_user_id || null}
              onChange={handleAssign}
              size="sm"
              placeholder="Selecionar responsável"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Detalhes sheet */}
      <Sheet open={showDetails} onOpenChange={setShowDetails}>
        <SheetContent side="right" className="w-[88vw] sm:max-w-sm p-0 overflow-y-auto">
          <div className="px-5 py-5 space-y-5">
            <SheetHeader>
              <SheetTitle>Detalhes do atendimento</SheetTitle>
            </SheetHeader>

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
                  placeholder="Sem responsável"
                />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Canal</dt>
                  <dd className="text-foreground">{thread.channel === 'whatsapp' ? 'WhatsApp' : (thread.channel || '—')}</dd>
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
