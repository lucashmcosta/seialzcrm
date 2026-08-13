// ============================================================================
// Leitura ÚNICA das feature flags do módulo Comercial.
//
// Motivo: o switch "Responder por" (`sales_manual_reply_endpoint_v1`) não pode
// introduzir nenhuma query nova quando está OFF. Por isso a leitura da flag do
// switch acontece na MESMA query já existente da flag do resolver V2
// (`conv_route_resolver_v2`) — uma requisição, duas flags, cache compartilhado.
//
// SOMENTE LEITURA: `feature_flags` só aceita UPDATE de admin de plataforma.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ROUTE_RESOLVER_FLAG } from '@/lib/salesReplyRoute';
import { MANUAL_REPLY_FLAG } from '@/lib/manualReplyEndpoint';

export interface FlagState {
  /** ON para a organização informada (flag global ligada + escopo) */
  enabledForOrg: boolean;
  /** valor bruto da flag (independente do escopo) */
  isEnabled: boolean;
  organizationIds: string[];
}

const EMPTY_FLAG: FlagState = { enabledForOrg: false, isEnabled: false, organizationIds: [] };

export interface SalesFeatureFlags {
  routeResolverV2: FlagState;
  manualReplyEndpoint: FlagState;
}

const EMPTY: SalesFeatureFlags = { routeResolverV2: EMPTY_FLAG, manualReplyEndpoint: EMPTY_FLAG };

const FLAG_NAMES = [ROUTE_RESOLVER_FLAG, MANUAL_REPLY_FLAG];

type FlagRow = {
  name: string;
  is_enabled?: boolean | null;
  organization_ids?: string[] | null;
};

function derive(row: FlagRow | undefined, organizationId?: string | null): FlagState {
  if (!row) return EMPTY_FLAG;
  const orgs = (row.organization_ids ?? []) as string[];
  const isEnabled = row.is_enabled === true;
  const enabledForOrg =
    isEnabled && (orgs.length === 0 || (!!organizationId && orgs.includes(organizationId)));
  return { enabledForOrg, isEnabled, organizationIds: orgs };
}

export function useSalesFeatureFlags(organizationId?: string | null) {
  const query = useQuery<SalesFeatureFlags>({
    queryKey: ['sales-feature-flags', organizationId ?? null],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('name, is_enabled, organization_ids')
        .in('name', FLAG_NAMES);
      const rows = (data ?? []) as FlagRow[];
      return {
        routeResolverV2: derive(
          rows.find((r) => r.name === ROUTE_RESOLVER_FLAG),
          organizationId,
        ),
        manualReplyEndpoint: derive(
          rows.find((r) => r.name === MANUAL_REPLY_FLAG),
          organizationId,
        ),
      };
    },
  });

  return { flags: query.data ?? EMPTY, isLoading: query.isLoading };
}
