import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SocialPlatform = 'instagram' | 'messenger';

export type SocialConversation = {
  id: string;
  platform: SocialPlatform;
  participant_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  profile_link: string | null;
  updated_time: string;
  last_message: string;
};

export type SocialAttachment = {
  type: 'image' | 'video' | 'audio' | 'file' | 'share';
  url: string;
  name?: string;
  mime?: string;
};

export type SocialMessage = {
  id: string;
  text: string;
  from_page: boolean;
  from_name: string;
  created_time: string;
  attachments?: SocialAttachment[];
};

export function useSocialConversations(orgId?: string) {
  return useQuery({
    queryKey: ['social-conversations', orgId],
    enabled: !!orgId,
    staleTime: 20_000,
    queryFn: async (): Promise<{ conversations: SocialConversation[]; channels: Record<string, string | null> }> => {
      const { data, error } = await supabase.functions.invoke('social-inbox', {
        body: { organization_id: orgId, action: 'conversations' },
      });
      if (error) throw error;
      return {
        conversations: (data?.conversations ?? []) as SocialConversation[],
        channels: (data?.channels ?? {}) as Record<string, string | null>,
      };
    },
  });
}

export function useSocialMessages(orgId?: string, conversationId?: string | null) {
  return useQuery({
    queryKey: ['social-messages', orgId, conversationId],
    enabled: !!orgId && !!conversationId,
    staleTime: 10_000,
    queryFn: async (): Promise<SocialMessage[]> => {
      const { data, error } = await supabase.functions.invoke('social-inbox', {
        body: { organization_id: orgId, action: 'messages', conversation_id: conversationId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao carregar mensagens');
      return (data?.messages ?? []) as SocialMessage[];
    },
  });
}

export type SocialProfile = {
  name: string | null;
  username?: string | null;
  avatar_url: string | null;
  follower_count?: number | null;
  is_verified?: boolean;
  follows_us?: boolean;
  we_follow?: boolean;
  profile_link: string | null;
};

export function useSocialProfile(orgId?: string, participantId?: string | null, platform?: SocialPlatform) {
  return useQuery({
    queryKey: ['social-profile', orgId, participantId],
    enabled: !!orgId && !!participantId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<SocialProfile | null> => {
      const { data, error } = await supabase.functions.invoke('social-inbox', {
        body: { organization_id: orgId, action: 'profile', participant_id: participantId, platform },
      });
      if (error) throw error;
      return (data?.profile ?? null) as SocialProfile | null;
    },
  });
}

export function useSendSocialMessage(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { conversation_id: string; recipient_id: string; text: string; platform: SocialPlatform }) => {
      const { data, error } = await supabase.functions.invoke('social-inbox', {
        body: { organization_id: orgId, action: 'send', ...i },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao enviar');
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['social-messages', orgId, v.conversation_id] });
      qc.invalidateQueries({ queryKey: ['social-conversations', orgId] });
    },
  });
}
