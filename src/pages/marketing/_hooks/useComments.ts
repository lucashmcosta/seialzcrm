import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CommentPlatform = 'facebook' | 'instagram';
export type MetaComment = {
  id: string;
  platform: CommentPlatform;
  text: string;
  author: string;
  created_time?: string;
  is_hidden?: boolean;
  post_id: string;
  post_excerpt?: string;
  permalink?: string;
};

export function useCommentsList(orgId?: string) {
  return useQuery({
    queryKey: ['meta-comments', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<MetaComment[]> => {
      const { data, error } = await supabase.functions.invoke('marketing-comments', {
        body: { organization_id: orgId, action: 'list' },
      });
      if (error) throw error;
      return (data?.comments ?? []) as MetaComment[];
    },
  });
}

async function invokeComment(orgId: string | undefined, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('marketing-comments', {
    body: { organization_id: orgId, ...body },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Falha');
  return data;
}

export function useCommentActions(orgId?: string) {
  const qc = useQueryClient();
  const refetch = () => qc.invalidateQueries({ queryKey: ['meta-comments', orgId] });

  const reply = useMutation({
    mutationFn: (i: { comment_id: string; platform: CommentPlatform; message: string }) =>
      invokeComment(orgId, { action: 'reply', ...i }),
    onSuccess: refetch,
  });
  const hide = useMutation({
    mutationFn: (i: { comment_id: string; hidden: boolean }) =>
      invokeComment(orgId, { action: 'hide', platform: 'facebook', ...i }),
    onSuccess: refetch,
  });
  const remove = useMutation({
    mutationFn: (i: { comment_id: string; platform: CommentPlatform }) =>
      invokeComment(orgId, { action: 'delete', ...i }),
    onSuccess: refetch,
  });
  return { reply, hide, remove };
}
