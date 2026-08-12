import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Campaign = {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
};

export function useCampaignsList(orgId?: string) {
  return useQuery({
    queryKey: ['ad-campaigns', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase.functions.invoke('marketing-ads-manage', {
        body: { organization_id: orgId, action: 'list' },
      });
      if (error) throw error;
      return (data?.campaigns ?? []) as Campaign[];
    },
  });
}

export function useSetCampaignStatus(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { campaign_id: string; status: 'PAUSED' | 'ACTIVE' }) => {
      const { data, error } = await supabase.functions.invoke('marketing-ads-manage', {
        body: { organization_id: orgId, action: 'set_status', ...i },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-campaigns', orgId] }); },
  });
}
