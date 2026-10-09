import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

/** Admin da organização = vínculo ativo com perfil de sistema (is_org_system_admin no servidor). */
export function useIsOrgSystemAdmin(): boolean {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { data } = useQuery({
    queryKey: ['is-org-system-admin', orgId],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_org_system_admin' as never, { _org: orgId } as never);
      if (error) return false;
      return data === true;
    },
  });
  return data === true;
}
