import type { InboxQueueCounts } from '@/hooks/inbox/useInboxQueueCounts';

interface Props {
  counts: InboxQueueCounts;
}

const ITEMS: { key: keyof InboxQueueCounts; label: string }[] = [
  { key: 'active', label: 'Ativos' },
  { key: 'waiting', label: 'Aguardando' },
  { key: 'resolved_today', label: 'Concluídos hoje' },
];

export function InboxMetricsBar({ counts }: Props) {
  return (
    <div className="h-12 border-b border-border bg-[hsl(var(--sz-bg2))] flex items-center px-6 gap-6 flex-shrink-0">
      {ITEMS.map((it) => (
        <div key={it.key} className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.label}</span>
          <span className="font-data text-sm text-foreground">{counts[it.key]}</span>
        </div>
      ))}
    </div>
  );
}
