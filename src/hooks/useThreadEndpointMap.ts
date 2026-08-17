import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns a map of threadId -> `message_threads.primary_endpoint_id`.
 *
 * Contrato preservado: este mapa alimenta o composer/envio, portanto é
 * ESTRITAMENTE `primary_endpoint_id`. Para o badge visual da lista de
 * conversas use `useThreadBadgeEndpoints` (prioriza a última mensagem).
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
        .select('id, primary_endpoint_id')
        .in('id', threadIds);

      if (cancelled) return;
      if (error) {
        console.warn('[useThreadEndpointMap] load failed', error.message);
        return;
      }

      const next: Record<string, string | null> = {};
      for (const row of (data ?? []) as any[]) {
        next[row.id] = row.primary_endpoint_id ?? null;
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
