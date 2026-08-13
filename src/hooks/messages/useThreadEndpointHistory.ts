// ============================================================================
// Fase 2.5 — "Histórico de endpoints utilizados" (SOMENTE LEITURA).
//
// Derivado de `messages.endpoint_id` da própria thread, na ordem de primeira
// ocorrência. Não usa `message_thread_merge_audit` (legível só por admin de
// plataforma) nem qualquer inferência por purpose/Route.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ThreadEndpointHistoryItem {
  endpointId: string;
  address: string | null;
  provider: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export function useThreadEndpointHistory(threadId?: string | null) {
  const query = useQuery<ThreadEndpointHistoryItem[]>({
    queryKey: ['thread-endpoint-history', threadId ?? null],
    enabled: !!threadId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: msgs } = await supabase
        .from('messages')
        .select('endpoint_id, created_at')
        .eq('thread_id', threadId as string)
        .not('endpoint_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1000);

      const ordered: Array<{ id: string; first: string | null; last: string | null }> = [];
      const index = new Map<string, number>();
      for (const row of (msgs ?? []) as Array<{ endpoint_id: string | null; created_at: string | null }>) {
        const id = row.endpoint_id;
        if (!id) continue;
        const existing = index.get(id);
        if (existing == null) {
          index.set(id, ordered.length);
          ordered.push({ id, first: row.created_at, last: row.created_at });
        } else {
          ordered[existing].last = row.created_at;
        }
      }
      if (ordered.length === 0) return [];

      const { data: eps } = await supabase
        .from('communication_endpoints')
        .select('id, external_address, provider')
        .in('id', ordered.map((o) => o.id));

      const byId = new Map(
        ((eps ?? []) as Array<{ id: string; external_address: string | null; provider: string | null }>)
          .map((e) => [e.id, e]),
      );

      return ordered.map((o) => ({
        endpointId: o.id,
        address: byId.get(o.id)?.external_address ?? null,
        provider: byId.get(o.id)?.provider ?? null,
        firstSeenAt: o.first,
        lastSeenAt: o.last,
      }));
    },
  });

  return { history: query.data ?? [], isLoading: query.isLoading };
}
