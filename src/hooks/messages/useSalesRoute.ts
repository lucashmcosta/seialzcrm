// ============================================================================
// Fase 2.5 — leitura da Route Comercial de uma thread (SOMENTE LEITURA).
//
// Reusa o resolver V2 do cliente (`resolveSalesReplyRoute`) sem alterá-lo e
// apenas enriquece o resultado com os dados de exibição (Route/linha, endpoint
// ativo, provider, endpoint que descobriu a Route).
//
// Nenhuma regra nova: quando o resolver nega, a UI mostra exatamente o motivo
// (`flag_off` = modo legado, `REPLY_ROUTE_UNRESOLVED` = sem inbound roteável).
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  resolveSalesReplyRoute,
  type SalesReplyRouteReason,
} from '@/lib/salesReplyRoute';

export interface RouteEndpointInfo {
  id: string;
  external_address: string | null;
  display_name: string | null;
  provider: string | null;
  purpose: string | null;
  is_active: boolean | null;
}

export interface SalesRouteLineInfo {
  id: string;
  name: string | null;
  key: string | null;
  inbox_key: string | null;
  channel: string | null;
  route_slug: string | null;
  is_active: boolean | null;
}

export interface SalesRouteInfo {
  reason: SalesReplyRouteReason;
  resolved: boolean;
  line: SalesRouteLineInfo | null;
  activeEndpoint: RouteEndpointInfo | null;
  discoveredByEndpoint: RouteEndpointInfo | null;
}

const EMPTY: SalesRouteInfo = {
  reason: 'missing_input',
  resolved: false,
  line: null,
  activeEndpoint: null,
  discoveredByEndpoint: null,
};

async function fetchEndpoint(id: string | null): Promise<RouteEndpointInfo | null> {
  if (!id) return null;
  const { data } = await supabase
    .from('communication_endpoints')
    .select('id, external_address, display_name, provider, purpose, is_active')
    .eq('id', id)
    .maybeSingle();
  return (data as RouteEndpointInfo | null) ?? null;
}

export function useSalesRoute(input: {
  threadId?: string | null;
  organizationId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
}) {
  const { threadId, organizationId, businessContext, channel } = input;

  const query = useQuery<SalesRouteInfo>({
    queryKey: ['sales-route', threadId ?? null, organizationId ?? null, businessContext ?? null],
    enabled: !!threadId,
    staleTime: 30_000,
    queryFn: async () => {
      const route = await resolveSalesReplyRoute({
        threadId,
        organizationId,
        businessContext,
        channel,
      });

      const discoveredByEndpoint = await fetchEndpoint(route.discoveredByEndpointId);

      if (!route.applicable) {
        return {
          ...EMPTY,
          reason: route.reason,
          discoveredByEndpoint,
        };
      }

      const [{ data: line }, activeEndpoint] = await Promise.all([
        supabase
          .from('messaging_lines')
          .select('id, name, key, inbox_key, channel, route_slug, is_active')
          .eq('id', route.lineId as string)
          .maybeSingle(),
        fetchEndpoint(route.sendEndpointId),
      ]);

      return {
        reason: route.reason,
        resolved: true,
        line: (line as SalesRouteLineInfo | null) ?? null,
        activeEndpoint,
        discoveredByEndpoint,
      };
    },
  });

  return {
    route: query.data ?? EMPTY,
    isLoading: query.isLoading,
  };
}
