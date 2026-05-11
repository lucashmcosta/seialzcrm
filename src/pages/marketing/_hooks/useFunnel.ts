import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FunnelData {
  impressions: number;
  clicks: number;
  conversations: number;
  leads: number;
  opps: number;
  won: number;
  imp_to_click_pct: number;
  click_to_conv_pct: number;
  conv_to_lead_pct: number;
  click_to_lead_pct: number;
  lead_to_opp_pct: number;
  opp_to_won_pct: number;
}

export function useFunnel(orgId: string | undefined, filterId?: string) {
  return useQuery({
    queryKey: ['marketing', 'funnel', orgId, filterId],
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<FunnelData> => {
      let q = supabase
        .from('vw_marketing_funnel' as any)
        .select('*')
        .eq('organization_id', orgId!);
      if (filterId && filterId !== 'all') q = q.eq('marketing_campaign_id', filterId);
      const { data, error } = await q;
      if (error) throw error;

      const rows = (data || []) as any[];
      const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
      const avg = (k: string) => rows.length ? rows.reduce((a, r) => a + Number(r[k] || 0), 0) / rows.length : 0;

      return {
        impressions: sum('stage_1_impressions'),
        clicks: sum('stage_2_clicks'),
        conversations: sum('stage_3_conversations'),
        leads: sum('stage_4_leads'),
        opps: sum('stage_5_opps'),
        won: sum('stage_6_won'),
        imp_to_click_pct: avg('cvr_imp_to_click_bps') / 100,
        click_to_conv_pct: avg('cvr_click_to_conv_bps') / 100,
        conv_to_lead_pct: avg('cvr_conv_to_lead_bps') / 100,
        click_to_lead_pct: avg('cvr_click_to_lead_overall_bps') / 100,
        lead_to_opp_pct: avg('cvr_lead_to_opp_bps') / 100,
        opp_to_won_pct: avg('cvr_opp_to_won_bps') / 100,
      };
    },
  });
}
