import { useMemo, useState } from 'react';
import { Robot } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { InboxSlaChip } from './InboxSlaChip';
import { SearchBar } from '@/components/common/SearchBar';
import { EndpointBadge } from '@/components/messages/EndpointBadge';
import type { InboxThreadRow } from '@/hooks/inbox/useInboxThreads';
import { agentFilterCounts, handoffInfo, matchesAgentFilter, waitingTeam, type InboxAgentFilter } from '@/lib/inboxAgentFilters';

interface Props {
  threads: InboxThreadRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  officialNumbers?: Set<string>;
}

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
  closed:   { label: 'Resolvida',    cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',       dot: 'bg-slate-500' },
};

function Pill({ children, cls, dot, pulse }: { children: React.ReactNode; cls: string; dot?: string; pulse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors', cls)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot, pulse && 'animate-pulse')} />}
      {children}
    </span>
  );
}

export function InboxThreadList({ threads, loading, selectedId, onSelect, officialNumbers }: Props) {
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<InboxAgentFilter>('all');
  const counts = useMemo(() => agentFilterCounts(threads), [threads]);
  const hasAgent = counts.agent > 0 || counts.needsHuman > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byAgent = threads.filter((t) => matchesAgentFilter(t, agentFilter));
    if (!q) return byAgent;
    return byAgent.filter((t) => {
      const name = (t.contact?.name || '').toLowerCase();
      const phone = (t.contact?.phone || '').toLowerCase();
      const last = (t.last_message_content || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || last.includes(q);
    });
  }, [threads, search, agentFilter]);

  return (
    <div className="w-[320px] flex-shrink-0 border-r border-border flex flex-col bg-background">
      <div className="h-14 border-b border-border flex items-center px-4">
        <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
        <span className="ml-2 font-data text-[10px] text-[hsl(var(--sz-t3))] bg-[hsl(var(--sz-bg3))] px-1.5 py-0.5 rounded">
          {filtered.length}
        </span>
      </div>
      <div className="px-3 py-2 border-b border-border">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar conversa..." />
        {hasAgent && (
          <div className="flex flex-wrap gap-1 mt-2" role="group" aria-label="Filtrar pelo agente">
            {([
              ['all', 'Todas', counts.all],
              ['agent', 'Com o agente', counts.agent],
              ['needs_human', 'Precisa de você', counts.needsHuman],
              ['answered', 'Equipe respondeu', counts.answered],
              ...(counts.urgent ? [['urgent', 'Urgente', counts.urgent] as const] : []),
              ...counts.areas.map(([area, n]) => [`area:${area}`, area, n] as const),
            ] as ReadonlyArray<readonly [InboxAgentFilter, string, number]>).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAgentFilter(id)}
                aria-pressed={agentFilter === id}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] border transition-colors',
                  agentFilter === id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {label} <span className="font-data">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-xs text-muted-foreground">Carregando…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {search ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa nesta fila.'}
          </div>
        )}
        {filtered.map((t) => {
          const name = t.contact?.name || t.contact?.phone || 'Sem contato';
          const isActive = selectedId === t.id;
          const status = STATUS_MAP[t.status || ''];
          const isUnread = t.last_message_direction === 'inbound';
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-border transition-all duration-150 block border-l-2',
                isActive
                  ? 'bg-[hsl(var(--sz-green-dim))] border-l-primary'
                  : isUnread
                    ? 'border-l-4 border-l-emerald-500 hover:bg-[hsl(var(--sz-bg3))]'
                    : 'border-l-transparent hover:bg-[hsl(var(--sz-bg3))] hover:border-l-primary/30',
              )}
            >
              <div className="flex gap-3">
                <div className={cn('h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0', colorFromName(name))}>
                  {initials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      'text-sm truncate flex-1 min-w-0',
                      isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                    )}>{name}</span>
                    <EndpointBadge
                      size="sm"
                      externalAddress={t.primary_endpoint?.external_address ?? null}
                      purpose={t.primary_endpoint?.purpose ?? null}
                    />
                    <span className={cn(
                      'font-data text-[10px]',
                      isUnread ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-[hsl(var(--sz-t3))]',
                    )}>{relTime(t.last_message_at)}</span>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" aria-label="Não lida" />
                    )}
                  </div>
                  <div className={cn(
                    'text-xs line-clamp-2 mb-1.5',
                    isUnread ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}>
                    {t.last_message_content || '—'}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <InboxSlaChip targetAt={t.sla_first_response_target_at} firstResponseAt={t.first_response_at} />
                    {status && <Pill cls={status.cls} dot={status.dot} pulse={status.pulse}>{status.label}</Pill>}
                    {t.contact?.lifecycle_stage === 'customer' && (
                      <Pill cls="bg-sky-500/15 text-sky-700 dark:text-sky-300" dot="bg-sky-500">Cliente</Pill>
                    )}
                    {t.needs_human_attention && (() => {
                      const h = handoffInfo(t);
                      if (!waitingTeam(t)) {
                        return (
                          <span title="A equipe respondeu por último. Volta para Precisa de você quando o cliente escrever.">
                            <Pill cls="bg-slate-500/15 text-slate-600 dark:text-slate-300" dot="bg-slate-500">
                              Equipe respondeu{h.area ? ` · ${h.area}` : ''}
                            </Pill>
                          </span>
                        );
                      }
                      return (
                        <span title="O agente passou esta conversa para a equipe e o cliente está esperando resposta">
                          <Pill cls="bg-destructive/15 text-destructive" dot="bg-destructive" pulse={h.urgent}>
                            {h.urgent ? 'Urgente · ' : ''}Precisa de você{h.area ? ` · ${h.area}` : ''}
                          </Pill>
                        </span>
                      );
                    })()}
                    {!t.needs_human_attention && t.agent && !t.ai_agent_released_at && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary"
                        title={`${t.agent.name ?? 'O agente'} está atendendo. Passa para a equipe quando precisar.`}
                      >
                        <Robot className="h-3 w-3" />
                        Com {t.agent.name ?? 'o agente'}
                      </span>
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
