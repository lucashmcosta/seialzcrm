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
  pending?: boolean;
};

// Busca conversas de UM canal (ou os dois). O Instagram é lento (~8s, latência da
// Meta) e o Messenger é rápido (~1s), então a tela pede os dois separadamente e
// renderiza o Messenger na hora, com o Instagram aparecendo quando chega.
export function useSocialConversations(orgId?: string, platform?: SocialPlatform) {
  return useQuery({
    queryKey: ['social-conversations', orgId, platform ?? 'all'],
    enabled: !!orgId,
    staleTime: 20_000,
    queryFn: async (): Promise<{ conversations: SocialConversation[]; channels: Record<string, string | null> }> => {
      const { data, error } = await supabase.functions.invoke('social-inbox', {
        body: { organization_id: orgId, action: 'conversations', ...(platform ? { platform } : {}) },
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

export type SocialSendAttachment = { type: 'image' | 'video' | 'audio' | 'file'; url: string };

export function useSendSocialMessage(orgId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: {
      conversation_id: string; recipient_id: string; text?: string;
      platform: SocialPlatform; attachment?: SocialSendAttachment;
    }) => {
      const { data, error } = await supabase.functions.invoke('social-inbox', {
        body: { organization_id: orgId, action: 'send', ...i },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao enviar');
      return data;
    },
    // Optimistic UI: a bolha aparece na hora e o request continua por trás.
    onMutate: async (v) => {
      const key = ['social-messages', orgId, v.conversation_id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SocialMessage[]>(key);
      const optimistic: SocialMessage = {
        id: 'optimistic-' + Math.random().toString(36).slice(2),
        text: v.text ?? '',
        from_page: true,
        from_name: '',
        created_time: new Date().toISOString(),
        attachments: v.attachment ? [{ type: v.attachment.type, url: v.attachment.url }] : [],
        pending: true,
      };
      qc.setQueryData<SocialMessage[]>(key, (old = []) => [...old, optimistic]);
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev && ctx?.key) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['social-messages', orgId, v.conversation_id] });
      qc.invalidateQueries({ queryKey: ['social-conversations', orgId] });
    },
  });
}

// Faz upload de um anexo pro bucket público social-media e devolve URL + tipo.
// A Meta busca essa URL ao enviar o attachment. Nome com timestamp evitado
// (Date.now proibido em alguns contextos); usamos random + org como pasta.
export async function uploadSocialMedia(
  orgId: string, file: File,
): Promise<SocialSendAttachment> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rand = Math.random().toString(36).slice(2);
  const path = `${orgId}/${rand}.${ext}`;
  const { error } = await supabase.storage.from('social-media').upload(path, file, {
    contentType: file.type || 'application/octet-stream', upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('social-media').getPublicUrl(path);
  const mime = file.type || '';
  const type: SocialSendAttachment['type'] =
    mime.startsWith('image') ? 'image' : mime.startsWith('video') ? 'video'
    : mime.startsWith('audio') ? 'audio' : 'file';
  return { type, url: data.publicUrl };
}
