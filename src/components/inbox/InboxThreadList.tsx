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

export function InboxThreadList({ threads, loading, selectedId, onSelect }: Props) {
  return (
    <div className="w-[340px] flex-shrink-0 border-r border-border flex flex-col bg-background">
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
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-border transition-colors block',
                isActive ? 'bg-[hsl(var(--sz-green-dim))]' : 'hover:bg-[hsl(var(--sz-bg3))]',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-medium text-foreground truncate flex-1">{name}</span>
                <span className="font-data text-[10px] text-[hsl(var(--sz-t3))]">{relTime(t.last_message_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                {t.last_message_content || '—'}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <InboxSlaChip targetAt={t.sla_first_response_target_at} firstResponseAt={t.first_response_at} />
                {t.status && (
                  <span className="font-data text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {t.status}
                  </span>
                )}
                {t.primary_endpoint?.purpose === 'customer_service' && (
                  <span className="font-data text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    CS endpoint
                  </span>
                )}
                {t.contact?.lifecycle_stage === 'customer' && (
                  <span className="font-data text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--sz-green-dim))] text-foreground">
                    customer
                  </span>
                )}
                {!t.assigned_user_id && (
                  <span className="font-data text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
                    não atribuída
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
