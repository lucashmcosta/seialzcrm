import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus } from '@phosphor-icons/react';
import type { InboxQueueCounts } from '@/hooks/inbox/useInboxQueueCounts';
import type { InboxTab } from '@/hooks/inbox/inboxScope';
import type { InboxAgentStats } from '@/hooks/inbox/useInboxAgentStats';
import { handoffRate } from '@/lib/inboxAgentFilters';

interface Props {
  counts: InboxQueueCounts;
  active: InboxTab;
  onChange: (tab: InboxTab) => void;
  onlyMine: boolean;
  onOnlyMineChange: (v: boolean) => void;
  onNewConversation?: () => void;
  /** Números do agente de atendimento de hoje; null/sem atendimento esconde o bloco. */
  agentStats?: InboxAgentStats | null;
}

function AgentStats({ stats }: { stats: InboxAgentStats }) {
  const solved = stats.handled - stats.escalated;
  const { pct, overTarget } = handoffRate(stats.handled, stats.escalated, stats.target_pct);
  const areas = Object.entries(stats.by_area).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}: ${n}`).join(' · ');
  return (
    <div
      className="flex items-center gap-2 text-[11px] text-muted-foreground"
      title={`Hoje o agente atendeu ${stats.handled} conversas. Resolveu ${solved} sozinho e passou ${stats.escalated} para a equipe.${areas ? ` Passadas por setor: ${areas}.` : ''} Meta: passar no máximo ${stats.target_pct}%.`}
    >
      <span className="uppercase tracking-wider">Agente hoje</span>
      <span className="font-data text-foreground">{solved}</span> resolvidas
      <span>·</span>
      <span className="font-data text-foreground">{stats.escalated}</span> passadas
      <span className={cn('font-data font-medium', overTarget ? 'text-destructive' : 'text-primary')}>({pct}%)</span>
      <span>· meta até {stats.target_pct}%</span>
    </div>
  );
}

const TABS: { id: InboxTab; label: string }[] = [
  { id: 'active', label: 'Ativos' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'resolved_today', label: 'Concluídos 7 dias' },
];

export function InboxMetricsBar({ counts, active, onChange, onlyMine, onOnlyMineChange, onNewConversation, agentStats }: Props) {
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
        {agentStats && agentStats.handled > 0 && <AgentStats stats={agentStats} />}
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
