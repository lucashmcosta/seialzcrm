import { useEffect, useState, useCallback, useRef } from 'react';
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

export interface LatestWonOpportunity {
  id: string;
  title: string;
  close_date: string | null;
  updated_at: string | null;
}

const THREAD_SELECT = `
  id, contact_id, channel, status, priority, organization_id,
  assigned_user_id, assigned_at, first_response_at,
  sla_first_response_target_at, sla_resolution_target_at,
  last_message_at, last_message_content, last_message_direction, resolved_at,
  last_inbound_at, whatsapp_last_inbound_at,
  primary_endpoint_id, last_routing_decision,
  contact:contacts ( id, name:full_name, phone, lifecycle_stage ),
  primary_endpoint:communication_endpoints ( id, purpose, external_address, provider )
`;

export function useInboxThread(threadId: string | null) {
  const [thread, setThread] = useState<InboxThreadRow | null>(null);
  const [history, setHistory] = useState<AssignmentHistoryRow[]>([]);
  const [latestWonOpportunity, setLatestWonOpportunity] = useState<LatestWonOpportunity | null>(null);
  const [loading, setLoading] = useState(false);
  const contactIdRef = useRef<string | null>(null);

  const fetchWonOpp = useCallback(async (contactId: string | null) => {
    if (!contactId) { setLatestWonOpportunity(null); return; }
    const { data } = await supabase
      .from('opportunities')
      .select('id, title, close_date, updated_at')
      .eq('contact_id', contactId)
      .eq('status', 'won')
      .is('deleted_at', null)
      .order('close_date', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestWonOpportunity((data ?? null) as LatestWonOpportunity | null);
  }, []);

  const refresh = useCallback(async () => {
    if (!threadId) { setThread(null); setHistory([]); setLatestWonOpportunity(null); return; }
    setLoading(true);
    const [{ data: t }, { data: h }] = await Promise.all([
      supabase.from('message_threads').select(THREAD_SELECT).eq('id', threadId).maybeSingle(),
      supabase.from('thread_assignment_history').select('*').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(50),
    ]);
    const threadRow = (t ?? null) as unknown as InboxThreadRow | null;
    setThread(threadRow);
    setHistory((h ?? []) as AssignmentHistoryRow[]);
    const contactId = threadRow?.contact_id || null;
    contactIdRef.current = contactId;
    await fetchWonOpp(contactId);
    setLoading(false);
  }, [threadId, fetchWonOpp]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: thread updates + assignment history inserts
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`inbox-thread-${threadId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_threads', filter: `id=eq.${threadId}` },
        (payload) => {
          const next = payload.new as Partial<InboxThreadRow>;
          setThread((prev) => (prev ? ({ ...prev, ...next } as InboxThreadRow) : prev));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'thread_assignment_history', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as AssignmentHistoryRow;
          setHistory((prev) => [row, ...prev].slice(0, 50));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  return { thread, history, latestWonOpportunity, loading, refresh };
}
