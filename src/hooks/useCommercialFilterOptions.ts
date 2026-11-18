// Opções do painel de filtros do Comercial, por organização (nada fixo por org).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StageOption { id: string; name: string; type: string; order_index: number }
export interface TagOption { id: string; name: string; color: string | null }
export interface AdOption { id: string; label: string; count: number }

export function useCommercialFilterOptions(orgId: string | undefined, enabled = true) {
  const stages = useQuery({
    queryKey: ['commercial-filter-stages', orgId],
    enabled: !!orgId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StageOption[]> => {
      const { data, error } = await supabase.from('pipeline_stages')
        .select('id, name, type, order_index').eq('organization_id', orgId!).order('order_index');
      if (error) throw error;
      return (data ?? []) as StageOption[];
    },
  });

  const tags = useQuery({
    queryKey: ['commercial-filter-tags', orgId],
    enabled: !!orgId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TagOption[]> => {
      const { data, error } = await supabase.from('tags')
        .select('id, name, color').eq('organization_id', orgId!).order('name');
      if (error) throw error;
      return (data ?? []) as TagOption[];
    },
  });

  // Anúncios que trouxeram contatos nos últimos 90 dias (id do anúncio + título que a Meta mandou).
  const ads = useQuery({
    queryKey: ['commercial-filter-ads', orgId],
    enabled: !!orgId && enabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<AdOption[]> => {
      const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase.from('contacts')
        .select('ad_referral_source_id, ad_referral_headline')
        .eq('organization_id', orgId!)
        .not('ad_referral_source_id', 'is', null)
        .gte('created_at', since)
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, AdOption>();
      for (const row of (data ?? []) as Array<{ ad_referral_source_id: string; ad_referral_headline: string | null }>) {
        const id = row.ad_referral_source_id;
        const cur = map.get(id) ?? { id, label: '', count: 0 };
        cur.count += 1;
        if (!cur.label && row.ad_referral_headline) cur.label = row.ad_referral_headline.slice(0, 60);
        map.set(id, cur);
      }
      return [...map.values()]
        .map((a) => ({ ...a, label: a.label || `Anúncio ${a.id.slice(-6)}` }))
        .sort((a, b) => b.count - a.count);
    },
  });

  return {
    stages: stages.data ?? [],
    tags: tags.data ?? [],
    ads: ads.data ?? [],
  };
}
