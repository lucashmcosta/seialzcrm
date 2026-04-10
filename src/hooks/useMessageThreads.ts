import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';

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
}

export function useMessageThreads(options: UseMessageThreadsOptions = {}) {
  const { channels = ['whatsapp'], limit = 200 } = options;
  const { organization, userProfile } = useOrganization();
  const { toast } = useToast();

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closures
  const threadsRef = useRef<ChatThread[]>([]);
  threadsRef.current = threads;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<number>(0);

  const orgId = organization?.id;
  const userId = userProfile?.id;

  // Core fetch function — calls the RPC
  const fetchThreads = useCallback(async () => {
    if (!orgId) return;

    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_list_message_threads', {
        p_organization_id: orgId,
        p_channels: channels,
        p_limit: limit,
      });

      if (rpcError) {
        // Handle ACCESS_DENIED (ERRCODE P0002)
        if (rpcError.message?.includes('ACCESS_DENIED') || rpcError.code === 'P0002') {
          setError('ACCESS_DENIED');
          setThreads([]);
          return;
        }
        throw rpcError;
      }

      const mapped = ((data as RpcThreadRow[]) || []).map(mapRpcToChatThread);
      setThreads(mapped);
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (err: any) {
      console.error('Error fetching threads via RPC:', err);
      setError(err.message || 'UNKNOWN_ERROR');
    } finally {
      setLoading(false);
    }
  }, [orgId, channels.join(','), limit]);

  // Debounced refetch — coalesces rapid realtime events
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

  // Realtime: UPDATE on message_threads — local setState, move thread to top
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
            // New thread appeared (e.g. channel filter change) — debounce full refetch
            debouncedRefetch();
            return prev;
          }
          // Merge realtime fields into existing thread
          const merged: ChatThread = {
            ...prev[idx],
            status: updated.status || prev[idx].status,
            needs_human_attention: updated.needs_human_attention ?? prev[idx].needs_human_attention,
            assigned_user_id: updated.assigned_user_id ?? prev[idx].assigned_user_id,
            updated_at: updated.updated_at || prev[idx].updated_at,
            last_message_direction: updated.last_message_direction ?? prev[idx].last_message_direction,
          };
          // Update last_message_content if trigger populated it
          if (updated.last_message_content !== undefined) {
            merged.last_message = updated.last_message_content || '...';
          }
          // Move to top and update
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
        // New thread created — debounced full refetch to get all joined data
        debouncedRefetch();
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
        // Only refetch if last fetch was > 5s ago
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

  // Explicit refetch (for use after mutations like send, assign, etc.)
  const refetchThreads = useCallback(() => {
    return fetchThreads();
  }, [fetchThreads]);

  return {
    threads,
    loading,
    error,
    refetchThreads,
  };
}
