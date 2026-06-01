import { cn } from '@/lib/utils';
import { ChatCircleDots, Hourglass, CheckCircle, UserCircle } from '@phosphor-icons/react';
import { Switch } from '@/components/ui/switch';
import type { InboxQueueCounts } from '@/hooks/inbox/useInboxQueueCounts';
import type { InboxTab } from '@/hooks/inbox/inboxScope';

interface Props {
  active: InboxTab;
  counts: InboxQueueCounts;
  onChange: (tab: InboxTab) => void;
  onlyMine: boolean;
  onOnlyMineChange: (v: boolean) => void;
}

const TABS: { id: InboxTab; label: string; icon: typeof ChatCircleDots }[] = [
  { id: 'active', label: 'Ativos', icon: ChatCircleDots },
  { id: 'waiting', label: 'Aguardando', icon: Hourglass },
  { id: 'resolved_today', label: 'Concluídos hoje', icon: CheckCircle },
];

export function InboxQueues({ active, counts, onChange, onlyMine, onOnlyMineChange }: Props) {
  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-border bg-[hsl(var(--sz-bg2))] flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-4">
        <h2 className="text-sm font-semibold text-foreground">Atendimento</h2>
      </div>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <UserCircle size={16} weight="light" className="text-muted-foreground" />
        <span className="flex-1 text-[12px] text-foreground">Apenas minhas</span>
        <Switch checked={onlyMine} onCheckedChange={onOnlyMineChange} />
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {TABS.map((q) => {
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
