import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns a map of threadId -> endpointId for the given thread IDs.
 *
 * Fonte primária: `message_threads.primary_endpoint_id`.
 * Fallback SOMENTE de exibição: quando a coluna está nula, usa o
 * `endpoint_id` da última mensagem da thread (`last_message_id`), para o
 * badge do número ficar consistente entre todos os números comerciais.
 * Nenhuma escrita, nenhuma decisão de roteamento — leitura pura.
 */
export function useThreadEndpointMap(
  threadIds: string[],
  enabled: boolean,
): Record<string, string | null> {
  const [map, setMap] = useState<Record<string, string | null>>({});

  // Stable key based on sorted ids to avoid re-fetching on every render.
  const key = enabled ? threadIds.slice().sort().join(',') : '';

  useEffect(() => {
    if (!enabled || threadIds.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('message_threads')
        .select('id, primary_endpoint_id, last_message_id')
        .in('id', threadIds);

      if (cancelled) return;
      if (error) {
        console.warn('[useThreadEndpointMap] load failed', error.message);
        return;
      }

      const next: Record<string, string | null> = {};
      const pendingByMessageId: Record<string, string> = {};
      for (const row of (data ?? []) as any[]) {
        const primary = row.primary_endpoint_id ?? null;
        next[row.id] = primary;
        if (!primary && row.last_message_id) {
          pendingByMessageId[row.last_message_id] = row.id;
        }
      }

      const missingMessageIds = Object.keys(pendingByMessageId);
      if (missingMessageIds.length > 0) {
        const { data: msgs, error: msgError } = await supabase
          .from('messages')
          .select('id, endpoint_id')
          .in('id', missingMessageIds);
        if (cancelled) return;
        if (msgError) {
          console.warn('[useThreadEndpointMap] fallback load failed', msgError.message);
        } else {
          for (const row of (msgs ?? []) as any[]) {
            const threadId = pendingByMessageId[row.id];
            if (threadId && row.endpoint_id) next[threadId] = row.endpoint_id;
          }
        }
      }

      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return map;
}

