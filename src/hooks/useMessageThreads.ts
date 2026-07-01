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

  // Debounced refetch
  const debouncedRefetch = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchThreads();
    }, 300);
  }, [fetchThreads]);

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

  // Realtime: UPDATE on message_threads
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`rpc-thread-updates-${orgId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'message_threads',
        filter: `organization_id=eq.${orgId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.id === updated.id);
          if (idx === -1) {
            debouncedRefetch();
            return prev;
          }
          const existing = prev[idx];
          const merged: ChatThread = {
            ...existing,
            status: updated.status || existing.status,
            needs_human_attention: updated.needs_human_attention ?? existing.needs_human_attention,
            assigned_user_id: updated.assigned_user_id ?? existing.assigned_user_id,
            updated_at: updated.updated_at || existing.updated_at,
            last_message_direction: updated.last_message_direction ?? existing.last_message_direction,
            last_inbound_at: updated.last_inbound_at ?? existing.last_inbound_at,
            whatsapp_last_inbound_at: updated.whatsapp_last_inbound_at ?? existing.whatsapp_last_inbound_at,
          };
          // Update last_message_content if trigger populated it
          if (updated.last_message_content !== undefined) {
            merged.last_message = updated.last_message_content || '...';
          }
          // Recalculate unread locally: mark as unread when new inbound message arrives
          // and we don't have a reliable last_read_at here — conservative approach:
          // if direction changed to inbound, mark unread; RPC will reconcile on next full fetch
          if (updated.last_message_direction === 'inbound') {
            merged.unread = true;
          }
          // Move to top
          const newList = [merged, ...prev.filter((_, i) => i !== idx)];
          return newList;
        });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_threads',
        filter: `organization_id=eq.${orgId}`,
      }, () => {
        debouncedRefetch();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'contacts',
        filter: `organization_id=eq.${orgId}`,
      }, (payload) => {
        const oldStage = (payload.old as any)?.lifecycle_stage;
        const newStage = (payload.new as any)?.lifecycle_stage;
        if (oldStage !== newStage) {
          debouncedRefetch();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, debouncedRefetch]);

  // Visibility change — reconcile when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastFetchRef.current > 5000) {
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
