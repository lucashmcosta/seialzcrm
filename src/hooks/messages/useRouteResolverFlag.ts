// ============================================================================
// Fase 2.5 — leitura da feature flag existente `conv_route_resolver_v2`.
// SOMENTE LEITURA: `feature_flags` só permite UPDATE para admin de plataforma
// (`is_admin_user()`), portanto a UI da organização apenas exibe o status.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ROUTE_RESOLVER_FLAG } from '@/lib/salesReplyRoute';

export interface RouteResolverFlagState {
  /** ON para a organização informada (flag global ligada + escopo) */
  enabledForOrg: boolean;
  /** valor bruto da flag (independente do escopo) */
  isEnabled: boolean;
  organizationIds: string[];
}

const EMPTY: RouteResolverFlagState = { enabledForOrg: false, isEnabled: false, organizationIds: [] };

export function useRouteResolverFlag(organizationId?: string | null) {
  const query = useQuery<RouteResolverFlagState>({
    queryKey: ['route-resolver-flag', organizationId ?? null],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('is_enabled, organization_ids')
        .eq('name', ROUTE_RESOLVER_FLAG)
        .maybeSingle();
      const row = data as { is_enabled?: boolean | null; organization_ids?: string[] | null } | null;
      if (!row) return EMPTY;
      const orgs = (row.organization_ids ?? []) as string[];
      const isEnabled = row.is_enabled === true;
      const enabledForOrg =
        isEnabled && (orgs.length === 0 || (!!organizationId && orgs.includes(organizationId)));
      return { enabledForOrg, isEnabled, organizationIds: orgs };
    },
  });

  return { flag: query.data ?? EMPTY, isLoading: query.isLoading };
}
