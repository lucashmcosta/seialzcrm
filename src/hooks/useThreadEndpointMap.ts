import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns a map of threadId -> primary_endpoint_id for the given thread IDs.
 * Used by /messages to display a "via …XXXX" badge per conversation when
 * the organization operates more than one WhatsApp number.
 *
 * Light query — pulls only the two columns and is gated by `enabled`
 * (false for single-endpoint tenants).
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
    supabase
      .from('message_threads')
      .select('id, primary_endpoint_id')
      .in('id', threadIds)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[useThreadEndpointMap] load failed', error.message);
          return;
        }
        const next: Record<string, string | null> = {};
        for (const row of data ?? []) {
          next[(row as any).id] = (row as any).primary_endpoint_id ?? null;
        }
        setMap(next);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return map;
}
