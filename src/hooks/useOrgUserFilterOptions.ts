import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrgUserFilterOption {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

/**
 * Usuários ativos da organização, para uso do filtro "por responsável" da lista
 * de conversas (apresentacional). Mesma fonte do `OwnerSelector`.
 */
export function useOrgUserFilterOptions(organizationId: string | undefined) {
  const [users, setUsers] = useState<OrgUserFilterOption[]>([]);

  useEffect(() => {
    if (!organizationId) {
      setUsers([]);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('user_organizations')
        .select('user_id, users(id, full_name, avatar_url)')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (cancelled) return;
      if (error) {
        console.warn('[useOrgUserFilterOptions] load failed', error.message);
        setUsers([]);
        return;
      }

      const mapped = (data ?? [])
        .map((row: any) => row.users)
        .filter(Boolean)
        .map((u: any) => ({
          id: u.id as string,
          fullName: (u.full_name as string) ?? '',
          avatarUrl: (u.avatar_url as string) ?? null,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));

      setUsers(mapped);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return users;
}
