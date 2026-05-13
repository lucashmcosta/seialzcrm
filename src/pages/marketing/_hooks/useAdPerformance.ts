import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdPerfRow {
  marketing_campaign_id: string;
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_status: string | null;
  creative_thumbnail_url: string | null;
  creative_headline: string | null;
  creative_body: string | null;
  destination_url: string | null;
  spend_brl: number | null;
  impressions: number | null;
  clicks: number | null;
  conversations_started: number | null;
  ctr_basis_points: number | null;
  leads_total: number | null;
  cpl_real_brl: number | null;
  opps_open: number | null;
  opps_won: number | null;
  opps_total: number | null;
  cac_brl: number | null;
  roas: number | null;
  revenue_won_brl: number | null;
  pipeline_value_brl: number | null;
  lead_to_opp_pct: number | null;
  opp_to_won_pct: number | null;
  first_lead_at: string | null;
  last_lead_at: string | null;
  last_insight_date: string | null;
}

interface UseAdPerfOpts {
  status?: string;       // 'all' | 'active' | 'paused' | ...
  campaignId?: string;   // 'all' or campaign id (text)
  search?: string;
  from?: Date;           // filter leads/opps/spend by creation date >= from
  to?: Date;             // filter leads/opps/spend by creation date < to
}

export function useAdPerformance(orgId: string | undefined, opts: UseAdPerfOpts = {}) {
  const fromIso = opts.from?.toISOString() ?? null;
  const toIso = opts.to?.toISOString() ?? null;
  return useQuery({
    queryKey: ['marketing', 'ads', orgId, opts.status, opts.campaignId, opts.search, fromIso, toIso],
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<AdPerfRow[]> => {
      const { data, error } = await supabase.rpc('get_marketing_ad_performance' as any, {
        p_organization_id: orgId!,
        p_from: fromIso,
        p_to: toIso,
        p_status: opts.status && opts.status !== 'all' ? opts.status : null,
        p_campaign_id: opts.campaignId && opts.campaignId !== 'all' ? opts.campaignId : null,
        p_search: opts.search || null,
        p_limit: 200,
      });
      if (error) throw error;
      return (data || []) as unknown as AdPerfRow[];
    },
  });
}

export function useAdById(adId: string | undefined) {
  return useQuery({
    queryKey: ['marketing', 'ad', adId],
    enabled: !!adId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<AdPerfRow | null> => {
      const { data, error } = await supabase
        .from('vw_marketing_ad_performance' as any)
        .select('*')
        .eq('marketing_campaign_id', adId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useCampaignsList(orgId: string | undefined) {
  return useQuery({
    queryKey: ['marketing', 'campaigns-distinct', orgId],
    enabled: !!orgId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_marketing_ad_performance' as any)
        .select('campaign_id, campaign_name')
        .eq('organization_id', orgId!);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of (data as any[]) || []) {
        if (r.campaign_id) map.set(r.campaign_id, r.campaign_name || r.campaign_id);
      }
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    },
  });
}
