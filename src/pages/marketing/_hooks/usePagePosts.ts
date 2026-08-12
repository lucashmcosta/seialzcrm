import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PagePost = {
  id: string;
  message: string;
  created_time?: string;
  permalink?: string;
  image?: string | null;
  media_type?: string;
};
export type PagePostsList = { facebook: PagePost[]; instagram: PagePost[] };
export type PublishTarget = 'facebook' | 'instagram';
export type PublishResult = Record<string, { id?: string; permalink?: string; error?: string }>;

// Lista os posts orgânicos recentes (FB + IG) da conexão Meta da org.
export function usePagePostsList(orgId?: string) {
  return useQuery({
    queryKey: ['page-posts', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<PagePostsList> => {
      const { data, error } = await supabase.functions.invoke('marketing-page-posts', {
        body: { organization_id: orgId, action: 'list' },
      });
      if (error) throw error;
      return { facebook: data?.facebook ?? [], instagram: data?.instagram ?? [] };
    },
  });
}

// Publica um post na Página e/ou Instagram.
export function usePublishPost(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { message: string; image_url?: string; targets: PublishTarget[] }): Promise<PublishResult> => {
      const { data, error } = await supabase.functions.invoke('marketing-page-posts', {
        body: { organization_id: orgId, action: 'publish', ...input },
      });
      if (error) throw error;
      return (data?.result ?? {}) as PublishResult;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['page-posts', orgId] }); },
  });
}
