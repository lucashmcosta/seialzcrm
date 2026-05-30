import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InboxQueue } from './useInboxQueueCounts';

export interface InboxThreadRow {
  id: string;
  contact_id: string | null;
  channel: string | null;
  status: string | null;
  priority: string | null;
  assigned_user_id: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  sla_first_response_target_at: string | null;
  sla_resolution_target_at: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_direction: string | null;
  resolved_at: string | null;
  contact?: { id: string; name: string | null; phone: string | null } | null;
}

const SELECT = `
  id, contact_id, channel, status, priority,
  assigned_user_id, assigned_at, first_response_at,
  sla_first_response_target_at, sla_resolution_target_at,
  last_message_at, last_message_content, last_message_direction, resolved_at,
  contact:contacts ( id, name, phone )
`;

export function useInboxThreads(queue: InboxQueue, currentUserId: string | null) {
  const [threads, setThreads] = useState<InboxThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('message_threads')
      .select(SELECT)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100);
    const nowIso = new Date().toISOString();
    switch (queue) {
      case 'mine':
        if (!currentUserId) { setThreads([]); setLoading(false); return; }
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
    const { data, error } = await q;
    if (error) setError(error.message);
    setThreads((data ?? []) as unknown as InboxThreadRow[]);
    setLoading(false);
  }, [queue, currentUserId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Realtime channel isolated to inbox — does NOT touch /messages
  useEffect(() => {
    const channel = supabase
      .channel(`inbox-threads-${queue}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_threads' }, () => {
        fetchThreads();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queue, fetchThreads]);

  return { threads, loading, error, refresh: fetchThreads };
}
