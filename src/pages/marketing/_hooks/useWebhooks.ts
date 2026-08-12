import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type WebhookStatus = { subscribed: boolean; fields: string[] };

export function useWebhookStatus(orgId?: string) {
  return useQuery({
    queryKey: ['page-webhooks', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<WebhookStatus> => {
      const { data, error } = await supabase.functions.invoke('marketing-page-webhooks', {
        body: { organization_id: orgId, action: 'list' },
      });
      if (error) throw error;
      return { subscribed: !!data?.subscribed, fields: data?.fields ?? [] };
    },
  });
}

export function useSubscribeWebhooks(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('marketing-page-webhooks', {
        body: { organization_id: orgId, action: 'subscribe' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['page-webhooks', orgId] }); },
  });
}
