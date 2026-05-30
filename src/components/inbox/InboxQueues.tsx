import { cn } from '@/lib/utils';
import { Tray, UserCircle, Clock, Warning, CheckCircle } from '@phosphor-icons/react';
import type { InboxQueue, InboxQueueCounts } from '@/hooks/inbox/useInboxQueueCounts';

interface Props {
  active: InboxQueue;
  counts: InboxQueueCounts;
  onChange: (q: InboxQueue) => void;
}

const QUEUES: { id: InboxQueue; label: string; icon: typeof Tray }[] = [
  { id: 'mine', label: 'Minhas', icon: UserCircle },
  { id: 'unassigned', label: 'Não atribuídas', icon: Tray },
  { id: 'in_sla', label: 'Em SLA', icon: Clock },
  { id: 'overdue', label: 'Atrasadas', icon: Warning },
  { id: 'resolved', label: 'Resolvidas', icon: CheckCircle },
];

export function InboxQueues({ active, counts, onChange }: Props) {
  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-border bg-[hsl(var(--sz-bg2))] flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-4">
        <h2 className="text-sm font-semibold text-foreground">Filas</h2>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {QUEUES.map((q) => {
          const Icon = q.icon;
          const isActive = active === q.id;
          const count = counts[q.id];
          return (
            <button
              key={q.id}
              onClick={() => onChange(q.id)}
              className={cn(
                'w-full flex items-center gap-3 h-10 px-4 text-[13px] transition-colors',
                isActive ? 'bg-[hsl(var(--sz-green-dim))] text-foreground font-medium' : 'text-muted-foreground hover:bg-[hsl(var(--sz-bg3))]',
              )}
            >
              <Icon size={18} weight={isActive ? 'fill' : 'light'} className={isActive ? 'text-primary' : ''} />
              <span className="flex-1 text-left">{q.label}</span>
              <span className="font-data text-[10px] text-[hsl(var(--sz-t3))] bg-[hsl(var(--sz-bg3))] px-1.5 py-0.5 rounded">
                {count}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
