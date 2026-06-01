import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InboxThreadRow } from './useInboxThreads';

export interface AssignmentHistoryRow {
  id: string;
  thread_id: string;
  action_type: string;
  from_user_id: string | null;
  to_user_id: string | null;
  performed_by_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const THREAD_SELECT = `
  id, contact_id, channel, status, priority, organization_id,
  assigned_user_id, assigned_at, first_response_at,
  sla_first_response_target_at, sla_resolution_target_at,
  last_message_at, last_message_content, last_message_direction, resolved_at,
  last_inbound_at, whatsapp_last_inbound_at,
  primary_endpoint_id,
  contact:contacts ( id, name:full_name, phone, lifecycle_stage ),
  primary_endpoint:communication_endpoints ( id, purpose, external_address )
`;

export function useInboxThread(threadId: string | null) {
  const [thread, setThread] = useState<InboxThreadRow | null>(null);
  const [history, setHistory] = useState<AssignmentHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!threadId) { setThread(null); setHistory([]); return; }
    setLoading(true);
    const [{ data: t }, { data: h }] = await Promise.all([
      supabase.from('message_threads').select(THREAD_SELECT).eq('id', threadId).maybeSingle(),
      supabase.from('thread_assignment_history').select('*').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(50),
    ]);
    setThread((t ?? null) as unknown as InboxThreadRow | null);
    setHistory((h ?? []) as AssignmentHistoryRow[]);
    setLoading(false);
  }, [threadId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { thread, history, loading, refresh };
}
