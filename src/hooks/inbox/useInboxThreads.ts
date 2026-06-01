import { useEffect, useState, useCallback } from 'react';
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

  // Realtime channel isolated to inbox — does NOT touch /messages.
  useEffect(() => {
    const channel = supabase
      .channel(`inbox-threads-${tab}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_threads' }, () => {
        fetchThreads();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab, fetchThreads]);

  return { threads, loading, error, debug, refresh: fetchThreads };
}
