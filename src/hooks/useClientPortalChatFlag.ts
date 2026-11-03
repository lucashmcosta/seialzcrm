import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const CLIENT_PORTAL_CHAT_FLAG = 'client_portal_chat';

/** Mesma regra de fn_feature_flag_enabled: flag ligada + org no escopo (lista vazia = global). */
export function useClientPortalChatFlag(organizationId?: string | null): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', CLIENT_PORTAL_CHAT_FLAG, organizationId ?? null],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('is_enabled, organization_ids')
        .eq('name', CLIENT_PORTAL_CHAT_FLAG)
        .maybeSingle();
      if (!data || data.is_enabled !== true) return false;
      const orgs = (data.organization_ids ?? []) as string[];
      return orgs.length === 0 || orgs.includes(organizationId as string);
    },
  });
  return data === true;
}
