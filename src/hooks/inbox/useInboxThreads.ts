import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchInboxScopedThreads,
  type InboxScopedThread,
  type InboxTab,
  type ScopeDebug,
} from './inboxScope';

export type InboxThreadRow = InboxScopedThread;

export function useInboxThreads(
  tab: InboxTab,
  onlyMine: boolean,
  internalUserId: string | null,
  orgTimezone: string | null,
  organizationId: string | null,
) {
  const [threads, setThreads] = useState<InboxThreadRow[]>([]);
  const [debug, setDebug] = useState<ScopeDebug | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows, debug } = await fetchInboxScopedThreads({
        tab,
        onlyMine,
        internalUserId,
        orgTimezone,
      });
      setThreads(rows);
      setDebug(debug);
      // eslint-disable-next-line no-console
      console.info(`[inbox] tab=${tab} B_raw=${debug.bRaw} B_filtered=${debug.bFiltered} merged=${debug.merged}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tab, onlyMine, internalUserId, orgTimezone]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Realtime — debounced refetch scoped to the current organization to avoid
  // a refetch storm when many threads change in quick succession (e.g. when
  // fn_update_thread_last_message fires for every new message).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!organizationId) return;
    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchThreads();
      }, 1500);
    };
    const channel = supabase
      .channel(`inbox-threads-${tab}-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads',
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_threads',
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefetch,
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [tab, organizationId, fetchThreads]);

  return { threads, loading, error, debug, refresh: fetchThreads };
}
