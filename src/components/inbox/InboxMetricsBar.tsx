import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus } from '@phosphor-icons/react';
import type { InboxQueueCounts } from '@/hooks/inbox/useInboxQueueCounts';
import type { InboxTab } from '@/hooks/inbox/inboxScope';

interface Props {
  counts: InboxQueueCounts;
  active: InboxTab;
  onChange: (tab: InboxTab) => void;
  onlyMine: boolean;
  onOnlyMineChange: (v: boolean) => void;
  onNewConversation?: () => void;
}

const TABS: { id: InboxTab; label: string }[] = [
  { id: 'active', label: 'Ativos' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'resolved_today', label: 'Concluídos hoje' },
];

export function InboxMetricsBar({ counts, active, onChange, onlyMine, onOnlyMineChange, onNewConversation }: Props) {
  return (
    <div className="h-12 border-b border-border bg-[hsl(var(--sz-bg2))] flex items-center px-6 gap-1 flex-shrink-0">
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'h-12 flex items-center gap-2 px-3 -mb-px border-b-2 transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('text-[11px] uppercase tracking-wider', isActive && 'font-medium')}>
              {t.label}
            </span>
            <span className="font-data text-sm text-foreground">{counts[t.id]}</span>
          </button>
        );
      })}

      <div className="ml-auto flex items-center gap-3">
        {onNewConversation && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={onNewConversation}
          >
            <Plus size={14} weight="bold" />
            Nova conversa
          </Button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Apenas minhas</span>
          <Switch checked={onlyMine} onCheckedChange={onOnlyMineChange} />
        </div>
      </div>
    </div>
  );
}
