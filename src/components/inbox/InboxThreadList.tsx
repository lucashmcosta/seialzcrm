import { cn } from '@/lib/utils';
import { InboxSlaChip } from './InboxSlaChip';
import type { InboxThreadRow } from '@/hooks/inbox/useInboxThreads';

interface Props {
  threads: InboxThreadRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
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

const STATUS_MAP: Record<string, { label: string; cls: string; dot: string; pulse?: boolean }> = {
  open:     { label: 'Aberta',     cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', pulse: true },
  pending:  { label: 'Aguardando', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',       dot: 'bg-amber-500' },
  resolved: { label: 'Resolvida',  cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',       dot: 'bg-slate-500' },
  closed:   { label: 'Fechada',    cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',       dot: 'bg-slate-500' },
};

function Pill({ children, cls, dot, pulse }: { children: React.ReactNode; cls: string; dot?: string; pulse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors', cls)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot, pulse && 'animate-pulse')} />}
      {children}
    </span>
  );
}

export function InboxThreadList({ threads, loading, selectedId, onSelect }: Props) {
  return (
    <div className="w-[320px] flex-shrink-0 border-r border-border flex flex-col bg-background">
      <div className="h-14 border-b border-border flex items-center px-4">
        <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
        <span className="ml-2 font-data text-[10px] text-[hsl(var(--sz-t3))] bg-[hsl(var(--sz-bg3))] px-1.5 py-0.5 rounded">
          {threads.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-xs text-muted-foreground">Carregando…</div>
        )}
        {!loading && threads.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa nesta fila.</div>
        )}
        {threads.map((t) => {
          const name = t.contact?.name || t.contact?.phone || 'Sem contato';
          const isActive = selectedId === t.id;
          const status = STATUS_MAP[t.status || ''];
          const isFresh = t.last_message_direction === 'inbound'
            && !!t.last_message_at
            && (Date.now() - new Date(t.last_message_at).getTime()) < 5 * 60 * 1000;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-border transition-all duration-150 block border-l-2',
                isActive
                  ? 'bg-[hsl(var(--sz-green-dim))] border-l-primary'
                  : 'border-l-transparent hover:bg-[hsl(var(--sz-bg3))] hover:border-l-primary/30',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {isFresh && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />}
                <span className="text-sm font-medium text-foreground truncate flex-1">{name}</span>
                <span className="font-data text-[10px] text-[hsl(var(--sz-t3))]">{relTime(t.last_message_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
