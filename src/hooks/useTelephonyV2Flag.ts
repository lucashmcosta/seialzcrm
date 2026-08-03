import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTelephonyV2Flag(organizationId?: string) {
  const query = useQuery({
    queryKey: ['feature-flag', 'telephony_v2', organizationId],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('feature_flags')
        .select('is_enabled, organization_ids').eq('name', 'telephony_v2').maybeSingle();
      if (error) return false;
      if (data?.is_enabled !== true) return false;
      const organizations = (data.organization_ids ?? []) as string[];
      return organizations.length === 0 || organizations.includes(organizationId!);
    },
  });
  return { enabled: query.data === true, loading: query.isLoading };
}
