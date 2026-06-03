import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AssignmentHistoryRow } from '@/hooks/inbox/useInboxThread';

interface Props {
  history: AssignmentHistoryRow[];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const ACTION_LABELS: Record<string, string> = {
  MANUAL_ASSIGNMENT: 'Atribuição manual',
  AUTO_ASSIGNMENT: 'Atribuição automática',
  TAKE_OVER: 'Assumiu o atendimento',
  RELEASE: 'Liberou o atendimento',
  REASSIGN: 'Reatribuição',
  UNASSIGN: 'Removeu atribuição',
};

const REASON_LABELS: Record<string, string> = {
  inbox_reassign_to_self: 'Reatribuiu para si',
  inbox_manual_reassign: 'Reatribuição manual',
  inbox_manual_assignment: 'Atribuição manual',
  inbox_auto_round_robin: 'Distribuição automática',
  inbox_release: 'Liberou da fila',
  inbox_take_over: 'Assumiu o atendimento',
};

function humanizeReason(reason: string | null): string | null {
  if (!reason) return null;
  if (REASON_LABELS[reason]) return REASON_LABELS[reason];
  // se for frase livre (contém espaço), mostra como veio
  if (reason.includes(' ')) return reason;
  // snake_case → frase
  return reason.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function composeSentence(
  row: AssignmentHistoryRow,
  nameOf: (id: string | null) => string,
): string {
  const performed = row.performed_by_user_id ? nameOf(row.performed_by_user_id) : null;
  const from = row.from_user_id ? nameOf(row.from_user_id) : null;
  const to = row.to_user_id ? nameOf(row.to_user_id) : null;

  switch (row.action_type) {
    case 'TAKE_OVER': {
      const who = performed ?? to ?? 'Alguém';
      return from ? `${who} assumiu o atendimento de ${from}` : `${who} assumiu o atendimento`;
    }
    case 'AUTO_ASSIGNMENT':
      return `Sistema atribuiu para ${to ?? 'usuário'}`;
    case 'MANUAL_ASSIGNMENT':
    case 'REASSIGN': {
      const who = performed ?? 'Alguém';
      if (to && performed && row.to_user_id === row.performed_by_user_id) {
        return from ? `${who} assumiu o atendimento de ${from}` : `${who} assumiu o atendimento`;
      }
      if (from && to) return `${who} transferiu de ${from} para ${to}`;
      if (to) return `${who} atribuiu para ${to}`;
      return `${who} atualizou a atribuição`;
    }
    case 'UNASSIGN':
    case 'RELEASE': {
      const who = performed ?? from ?? 'Alguém';
      return `${who} liberou o atendimento`;
    }
    default: {
      const who = performed ?? 'Alguém';
      const label = actionLabel(row.action_type).toLowerCase();
      if (from && to) return `${who} ${label}: ${from} → ${to}`;
      if (to) return `${who} ${label} para ${to}`;
      return `${who} · ${actionLabel(row.action_type)}`;
    }
  }
}

export function InboxAssignmentHistory({ history }: Props) {
  const userIds = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) {
      if (h.from_user_id) set.add(h.from_user_id);
      if (h.to_user_id) set.add(h.to_user_id);
      if (h.performed_by_user_id) set.add(h.performed_by_user_id);
    }
    return Array.from(set);
  }, [history]);

  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (userIds.length === 0) { setNames({}); return; }
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', userIds);
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const u of data ?? []) {
        map[u.id as string] = (u.full_name as string) || 'Usuário';
      }
      setNames(map);
    })();
    return () => { cancelled = true; };
  }, [userIds]);

  const nameOf = (id: string | null) => (id ? names[id] ?? 'Usuário removido' : 'Usuário');

  if (history.length === 0) {
    return <div className="text-xs text-muted-foreground">Sem histórico de atribuição.</div>;
  }

  return (
    <ol className="space-y-3">
      {history.map((h) => {
        const sentence = composeSentence(h, nameOf);
        const reason = humanizeReason(h.reason);
        return (
          <li key={h.id} className="text-sm border-l-2 border-border pl-3">
            <div className="text-foreground leading-snug">{sentence}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmt(h.created_at)}
              {reason && <span> · {reason}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
