// ============================================================================
// Fase 2.5 — ids de threads já consolidadas (merged) para OCULTAR da lista do
// Comercial. Não reescreve a query/RPC de listagem: apenas informa quais ids
// não devem ser exibidos.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useConsolidatedThreadIds(threadIds: string[]): Set<string> {
  const key = [...threadIds].sort().join(',');

  const query = useQuery<string[]>({
    queryKey: ['consolidated-thread-ids', key],
    enabled: threadIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('message_threads')
        .select('id')
        .in('id', threadIds)
        .not('merged_into_thread_id', 'is', null);
      return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    },
  });

  return new Set(query.data ?? []);
}
