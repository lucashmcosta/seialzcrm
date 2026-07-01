import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export interface ChatThread {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  last_message: string | null;
  last_message_direction: string | null;
  updated_at: string;
  whatsapp_last_inbound_at: string | null;
  last_inbound_at: string | null;
  unread: boolean;
  needs_human_attention: boolean;
  status: string;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
}

interface RpcThreadRow {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  channel: string;
  subject: string | null;
  status: string;
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_direction: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  whatsapp_last_inbound_at: string | null;
  needs_human_attention: boolean;
  agent_typing: boolean;
  awaiting_button_response: boolean;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  updated_at: string;
  created_at: string;
  is_unread: boolean;
}

function mapRpcToChatThread(row: RpcThreadRow): ChatThread {
  return {
    id: row.id,
    contact_id: row.contact_id,
    contact_name: row.contact_name || 'Desconhecido',
    contact_phone: row.contact_phone,
    last_message: row.last_message_content || '...',
    last_message_direction: row.last_message_direction,
    updated_at: row.updated_at,
    whatsapp_last_inbound_at: row.whatsapp_last_inbound_at,
    last_inbound_at: row.last_inbound_at,
    unread: row.is_unread,
    needs_human_attention: row.needs_human_attention,
    status: row.status || 'open',
    assigned_user_id: row.assigned_user_id,
    assigned_user_name: row.assigned_user_name,
  };
}

interface UseMessageThreadsOptions {
  channels?: string[];
  limit?: number;
  search?: string;
}

const REALTIME_FLUSH_MS = 400;
const VISIBILITY_REFETCH_MS = 60_000;

export function useMessageThreads(options: UseMessageThreadsOptions = {}) {
  const { channels = ['whatsapp'], limit = 50, search } = options;
  const searchTerm = search && search.trim().length > 0 ? search.trim() : null;
  const { organization, userProfile } = useOrganization();

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<number>(0);

  const orgId = organization?.id;
  const userId = userProfile?.id;

  // Stable channel key to avoid re-renders
  const channelKey = channels.join(',');

  // Core fetch — initial load (no cursor)
  const fetchThreads = useCallback(async () => {
    if (!orgId) return;

    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_list_message_threads', {
        p_organization_id: orgId,
        p_channels: channels,
        p_limit: limit,
        p_search: searchTerm,
      });

      if (rpcError) {
        if (rpcError.message?.includes('ACCESS_DENIED') || rpcError.code === 'P0002') {
          setError('ACCESS_DENIED');
          setThreads([]);
          return;
        }
        throw rpcError;
      }

      const rows = (data as RpcThreadRow[]) || [];
      const mapped = rows.map(mapRpcToChatThread);
      setThreads(mapped);
      setHasMore(rows.length >= limit);
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (err: any) {
      console.error('Error fetching threads via RPC:', err);
      setError(err.message || 'UNKNOWN_ERROR');
    } finally {
      setLoading(false);
    }
  }, [orgId, channelKey, limit, searchTerm]);

  // Load more — cursor-based pagination
  const loadMore = useCallback(async () => {
    if (!orgId || !hasMore || loadingMore) return;
    const lastThread = threads[threads.length - 1];
    if (!lastThread) return;

    setLoadingMore(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_list_message_threads', {
        p_organization_id: orgId,
        p_channels: channels,
        p_limit: limit,
        p_cursor_updated_at: lastThread.updated_at,
        p_cursor_id: lastThread.id,
        p_search: searchTerm,
      });

      if (rpcError) throw rpcError;

      const rows = (data as RpcThreadRow[]) || [];
      const mapped = rows.map(mapRpcToChatThread);
      setThreads((prev) => [...prev, ...mapped]);
      setHasMore(rows.length >= limit);
    } catch (err: any) {
      console.error('Error loading more threads:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, channelKey, limit, hasMore, loadingMore, threads, searchTerm]);

  // ---------------------------------------------------------------
  // Realtime: patch-local por thread (sem refetch da lista inteira)
  // ---------------------------------------------------------------
  // Cada UPDATE/INSERT em message_threads é coalescido num Set de ids.
  // Após REALTIME_FLUSH_MS de inatividade, chamamos rpc_get_message_threads_by_ids
  // uma única vez com todos os ids pendentes e fazemos upsert local no state,
  // movendo os threads afetados para o topo (ordenados por updated_at desc).
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enrichAndUpsert = useCallback(async () => {
    if (!orgId) return;
    const ids = Array.from(pendingIdsRef.current);
    pendingIdsRef.current.clear();
    if (ids.length === 0) return;

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'rpc_get_message_threads_by_ids',
        { p_organization_id: orgId, p_thread_ids: ids }
      );
      if (rpcError) {
        console.error('Error enriching threads:', rpcError);
        return;
      }
      const rows = (data as RpcThreadRow[]) || [];
      if (rows.length === 0) return;

      const enriched = rows.map(mapRpcToChatThread);
      // Ordena os enriquecidos por updated_at desc antes de prepend.
      enriched.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

      setThreads((prev) => {
        const enrichedIds = new Set(enriched.map((t) => t.id));
        const rest = prev.filter((t) => !enrichedIds.has(t.id));
        return [...enriched, ...rest];
      });
    } catch (err) {
      console.error('Unexpected error enriching threads:', err);
    }
  }, [orgId]);

  const scheduleEnrich = useCallback(
    (id: string, rowChannel?: string) => {
      // Ignora eventos de canais que este hook não consome.
      if (rowChannel && channels.length > 0 && !channels.includes(rowChannel)) return;
      pendingIdsRef.current.add(id);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        enrichAndUpsert();
      }, REALTIME_FLUSH_MS);
    },
    // channelKey estável evita re-subscribe
    [enrichAndUpsert, channelKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Initial load
  useEffect(() => {
    if (!orgId || !userId) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchThreads();
  }, [orgId, userId, fetchThreads]);

  // Realtime: UPDATE + INSERT em message_threads → enrichment por id
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`rpc-thread-updates-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_threads',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.id) scheduleEnrich(row.id, row.channel);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.id) scheduleEnrich(row.id, row.channel);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [orgId, scheduleEnrich]);

  // Visibility change — reconcile só se ficou oculto por >60s
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastFetchRef.current > VISIBILITY_REFETCH_MS) {
          fetchThreads();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchThreads]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Mark a thread as read locally (call after opening a thread)
  const markThreadRead = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t))
    );
  }, []);

  const refetchThreads = useCallback(() => {
    return fetchThreads();
  }, [fetchThreads]);

  return {
    threads,
    loading,
    loadingMore,
    hasMore,
    error,
    refetchThreads,
    loadMore,
    markThreadRead,
  };
}
