import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { summarizeOriginalSpend, type OriginalSpendRow } from '../_lib/originalSpend';

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/** Gasto na moeda da conta de anúncio, quando ela é diferente da moeda da org. Null quando são iguais. */
export function useSpendOriginal(orgId: string | undefined, from: Date, to: Date) {
  const { organization } = useOrganization();
  const orgCurrency = (organization as { default_currency?: string } | null)?.default_currency ?? 'BRL';
  return useQuery({
    queryKey: ['marketing', 'spend-original', orgId, orgCurrency, toISODate(from), toISODate(to)],
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_campaign_insights_daily')
        .select('marketing_campaign_id, spend_currency, spend_original_cents')
        .eq('organization_id', orgId!)
        .neq('spend_currency', orgCurrency)
        .gte('date', toISODate(from))
        .lte('date', toISODate(to));
      if (error) throw error;
      return summarizeOriginalSpend((data ?? []) as unknown as OriginalSpendRow[]);
    },
  });
}
