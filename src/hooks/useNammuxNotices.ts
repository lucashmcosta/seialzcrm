import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { listNotices, NAMMUX_NOTICES_FLAG, NAMMUX_NOTICES_QUERY_KEY, pendingCount } from '@/lib/nammuxNotices';

/** A organização ligou os avisos automáticos ao cliente? (integration_feature_flags) */
export function useNammuxNoticesFlagState(organizationId?: string | null): { enabled: boolean; resolved: boolean } {
  const { data, isFetched } = useQuery({
    queryKey: ['feature-flag', NAMMUX_NOTICES_FLAG, organizationId ?? null],
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('fn_feature_flag_enabled', {
        _flag_key: NAMMUX_NOTICES_FLAG,
        _organization_id: organizationId as string,
      });
      return data === true;
    },
  });
  return { enabled: data === true, resolved: isFetched };
}

export function useNammuxNoticesFlag(organizationId?: string | null): boolean {
  return useNammuxNoticesFlagState(organizationId).enabled;
}

/** Lista da tela e contador do menu. Só consulta com a flag ligada. */
export function useNammuxNotices(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [...NAMMUX_NOTICES_QUERY_KEY, organizationId ?? null],
    enabled: !!organizationId && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    // Quem não tem permissão de aprovar recebe "forbidden": não insistir.
    retry: false,
    queryFn: () => listNotices(organizationId as string),
  });
}

export function useNammuxNoticesPendingCount(organizationId?: string | null, enabled = true): number {
  const { data } = useNammuxNotices(organizationId, enabled);
  return data ? pendingCount(data.items) : 0;
}
