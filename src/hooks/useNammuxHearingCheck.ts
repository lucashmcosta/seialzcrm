import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  listHearingCheck, NAMMUX_HEARING_CHECK_FLAG, NAMMUX_HEARING_CHECK_QUERY_KEY, todayInSaoPaulo, urgentCount,
} from '@/lib/nammuxHearingCheck';

/** A organização ligou a conferência de avisos de audiência? (integration_feature_flags) */
export function useNammuxHearingCheckFlagState(organizationId?: string | null): { enabled: boolean; resolved: boolean } {
  const { data, isFetched } = useQuery({
    queryKey: ['feature-flag', NAMMUX_HEARING_CHECK_FLAG, organizationId ?? null],
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('fn_feature_flag_enabled', {
        _flag_key: NAMMUX_HEARING_CHECK_FLAG,
        _organization_id: organizationId as string,
      });
      return data === true;
    },
  });
  return { enabled: data === true, resolved: isFetched };
}

export function useNammuxHearingCheckFlag(organizationId?: string | null): boolean {
  return useNammuxHearingCheckFlagState(organizationId).enabled;
}

/** Lista da tela e contador do menu. Só consulta com a flag ligada. */
export function useNammuxHearingCheck(organizationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [...NAMMUX_HEARING_CHECK_QUERY_KEY, organizationId ?? null],
    enabled: !!organizationId && enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: false,
    queryFn: () => listHearingCheck(organizationId as string),
  });
}

export function useNammuxHearingCheckUrgentCount(organizationId?: string | null, enabled = true): number {
  const { data } = useNammuxHearingCheck(organizationId, enabled);
  return data ? urgentCount(data, todayInSaoPaulo()) : 0;
}
