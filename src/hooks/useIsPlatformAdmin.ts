import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Platform admin = registro em admin_users com MFA (mesma regra de is_admin_user()
 * usada no servidor). Não usa users.is_platform_admin (coluna legada).
 */
export function useIsPlatformAdmin(enabled = true): boolean {
  const { data } = useQuery({
    queryKey: ['is-platform-admin'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin_user');
      if (error) return false;
      return data === true;
    },
  });
  return data === true;
}
