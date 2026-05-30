import type { AssignmentHistoryRow } from '@/hooks/inbox/useInboxThread';

interface Props {
  history: AssignmentHistoryRow[];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function InboxAssignmentHistory({ history }: Props) {
  if (history.length === 0) {
    return <div className="text-xs text-muted-foreground">Sem histórico de atribuição.</div>;
  }
  return (
    <ol className="space-y-2">
      {history.map((h) => (
        <li key={h.id} className="text-xs border-l-2 border-border pl-3">
          <div className="flex items-center gap-2">
            <span className="font-data text-[10px] uppercase tracking-wider text-primary">{h.action_type}</span>
            <span className="font-data text-[10px] text-[hsl(var(--sz-t3))]">{fmt(h.created_at)}</span>
          </div>
          {(h.from_user_id || h.to_user_id) && (
            <div className="text-muted-foreground mt-0.5">
              {h.from_user_id && <span>de <span className="font-mono">{h.from_user_id.slice(0, 8)}</span></span>}
              {h.from_user_id && h.to_user_id && <span> → </span>}
              {h.to_user_id && <span>para <span className="font-mono">{h.to_user_id.slice(0, 8)}</span></span>}
            </div>
          )}
          {h.reason && <div className="text-muted-foreground mt-0.5 italic">"{h.reason}"</div>}
        </li>
      ))}
    </ol>
  );
}
