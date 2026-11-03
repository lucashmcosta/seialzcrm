import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PORTAL_MENU_UNREAD_KEY = ['portal-chat-menu-unread'] as const;

/** Soma de não lidas do Chat do App (último estado guardado dos avisos do App). */
export function useClientPortalUnreadCount(orgId: string | undefined, enabled: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...PORTAL_MENU_UNREAD_KEY, orgId],
    enabled: enabled && !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from('client_portal_chat_events')
        .select('unread_for_staff').eq('organization_id', orgId!).gt('unread_for_staff', 0);
      return (data ?? []).reduce((s, r: any) => s + (r.unread_for_staff ?? 0), 0);
    },
  });
  useEffect(() => {
    if (!enabled || !orgId) return;
    const ch = supabase
      .channel(`portal-menu-unread-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_portal_chat_events', filter: `organization_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: PORTAL_MENU_UNREAD_KEY }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, orgId, qc]);
  return q.data ?? 0;
}
