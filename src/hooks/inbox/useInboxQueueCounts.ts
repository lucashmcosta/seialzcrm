import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type InboxQueue = 'mine' | 'unassigned' | 'in_sla' | 'overdue' | 'resolved';

export interface InboxQueueCounts {
  mine: number;
  unassigned: number;
  in_sla: number;
  overdue: number;
  resolved: number;
}

const ZERO: InboxQueueCounts = { mine: 0, unassigned: 0, in_sla: 0, overdue: 0, resolved: 0 };

async function countQueue(queue: InboxQueue, currentUserId: string | null): Promise<number> {
  let q = supabase.from('message_threads').select('id', { count: 'exact', head: true });
  const nowIso = new Date().toISOString();
  switch (queue) {
    case 'mine':
      if (!currentUserId) return 0;
      q = q.eq('assigned_user_id', currentUserId);
      break;
    case 'unassigned':
      q = q.is('assigned_user_id', null).eq('status', 'open');
      break;
    case 'in_sla':
      q = q.gt('sla_first_response_target_at', nowIso).is('first_response_at', null);
      break;
    case 'overdue':
      q = q.lt('sla_first_response_target_at', nowIso).is('first_response_at', null).eq('status', 'open');
      break;
    case 'resolved':
      q = q.eq('status', 'resolved');
      break;
  }
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export function useInboxQueueCounts(currentUserId: string | null) {
  const [counts, setCounts] = useState<InboxQueueCounts>(ZERO);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [mine, unassigned, in_sla, overdue, resolved] = await Promise.all([
      countQueue('mine', currentUserId),
      countQueue('unassigned', currentUserId),
      countQueue('in_sla', currentUserId),
      countQueue('overdue', currentUserId),
      countQueue('resolved', currentUserId),
    ]);
    setCounts({ mine, unassigned, in_sla, overdue, resolved });
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { counts, loading, refresh };
}
