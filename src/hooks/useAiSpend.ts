import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { summarizeAiSpend, type AiProviderSpend, type AiSpendRow } from '@/lib/aiSpend';

/** Gasto estimado do mês por provedor. Só busca para quem pode configurar as chaves. */
export function useAiSpend(organizationId: string | undefined, canManage: boolean) {
  return useQuery({
    queryKey: ['ai-spend', organizationId],
    enabled: !!organizationId && canManage,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, AiProviderSpend>> => {
      const { data, error } = await supabase.rpc('rpc_ai_spend_summary' as never, { p_org: organizationId } as never);
      if (error) throw error;
      return summarizeAiSpend((data ?? []) as unknown as AiSpendRow[]);
    },
  });
}
