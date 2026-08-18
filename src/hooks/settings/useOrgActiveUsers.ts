// Usuários ativos da organização — usado apenas para escolher o dono de um
// número pessoal (`communication_endpoints.assigned_user_id`).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgActiveUser {
  id: string;
  fullName: string;
}

export function useOrgActiveUsers(organizationId?: string | null) {
  const query = useQuery<OrgActiveUser[]>({
    queryKey: ['org-active-users', organizationId ?? null],
    enabled: !!organizationId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from('user_organizations')
        .select('user_id, is_active')
        .eq('organization_id', organizationId as string);
      if (error) throw error;

      const ids = (memberships ?? [])
        .filter((m) => m.is_active !== false)
        .map((m) => m.user_id)
        .filter((x): x is string => !!x);
      if (!ids.length) return [];

      const { data: users, error: uErr } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', ids);
      if (uErr) throw uErr;

      return (users ?? [])
        .map((u) => ({
          id: u.id as string,
          fullName: (u.full_name as string | null) || (u.email as string | null) || 'Usuário',
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
    },
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
  };
}
