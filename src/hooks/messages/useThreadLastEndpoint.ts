// ============================================================================
// Endpoint da ÚLTIMA MENSAGEM VÁLIDA da conversa (inbound OU outbound).
//
// É a fonte da seleção "derived" do seletor "Responder por". Somente leitura:
// não persiste nada e não toca `active_endpoint_id`/`primary_endpoint_id`.
// O backend reconsulta essa mesma informação no envio (fonte de verdade).
// ============================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const threadLastEndpointKey = (threadId?: string | null) => [
  'thread-last-endpoint',
  threadId ?? null,
];

export function useThreadLastEndpoint(params: {
  threadId?: string | null;
  enabled?: boolean;
}) {
  const { threadId, enabled = true } = params;

  const query = useQuery<{
    messageId: string;
    endpointId: string;
    direction: string;
    sentAt: string | null;
    createdAt: string;
  } | null>({
    queryKey: threadLastEndpointKey(threadId),
    enabled: !!threadId && enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, endpoint_id, direction, sent_at, created_at')
        .eq('thread_id', threadId!)
        .in('direction', ['inbound', 'outbound'])
        .is('deleted_at', null)
        .not('is_internal_note', 'is', true)
        .not('endpoint_id', 'is', null)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as {
        id: string;
        endpoint_id: string | null;
        direction: string;
        sent_at: string | null;
        created_at: string;
      } | null;
      if (!row?.endpoint_id) return null;
      return {
        messageId: row.id,
        endpointId: row.endpoint_id,
        direction: row.direction,
        sentAt: row.sent_at,
        createdAt: row.created_at,
      };
    },
  });

  return {
    lastEndpointId: query.data?.endpointId ?? null,
    lastMessageId: query.data?.messageId ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}

/** Invalidação após envio/recebimento — mantém o seletor coerente. */
export function useInvalidateThreadLastEndpoint() {
  const queryClient = useQueryClient();
  return useCallback(
    (threadId?: string | null) => {
      queryClient.invalidateQueries({ queryKey: threadLastEndpointKey(threadId) });
    },
    [queryClient],
  );
}
