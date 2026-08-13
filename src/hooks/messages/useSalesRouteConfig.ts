// ============================================================================
// Fase 2.5 — configuração da Route Comercial para Configurações > Integrações.
// SOMENTE LEITURA de `messaging_lines`, `messaging_line_endpoints` e
// `communication_endpoints`.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesRouteConfigEndpoint {
  id: string;
  external_address: string | null;
  display_name: string | null;
  provider: string | null;
  is_active: boolean | null;
  linkActive: boolean;
  isRouteActive: boolean;
}

export interface SalesRouteConfig {
  lineId: string;
  name: string | null;
  key: string | null;
  inboxKey: string | null;
  channel: string | null;
  routeSlug: string | null;
  isActive: boolean | null;
  activeEndpoint: SalesRouteConfigEndpoint | null;
  endpoints: SalesRouteConfigEndpoint[];
}

export function useSalesRouteConfig(organizationId?: string | null) {
  const query = useQuery<SalesRouteConfig[]>({
    queryKey: ['sales-route-config', organizationId ?? null],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: lines } = await supabase
        .from('messaging_lines')
        .select('id, name, key, inbox_key, channel, route_slug, is_active, active_endpoint_id')
        .eq('organization_id', organizationId as string)
        .eq('inbox_key', 'sales')
        .order('created_at', { ascending: true });

      const lineRows = (lines ?? []) as Array<{
        id: string;
        name: string | null;
        key: string | null;
        inbox_key: string | null;
        channel: string | null;
        route_slug: string | null;
        is_active: boolean | null;
        active_endpoint_id: string | null;
      }>;
      if (lineRows.length === 0) return [];

      const { data: links } = await supabase
        .from('messaging_line_endpoints')
        .select('line_id, endpoint_id, is_active')
        .in('line_id', lineRows.map((l) => l.id));

      const linkRows = (links ?? []) as Array<{
        line_id: string | null;
        endpoint_id: string | null;
        is_active: boolean | null;
      }>;

      const endpointIds = Array.from(
        new Set([
          ...linkRows.map((l) => l.endpoint_id).filter((x): x is string => !!x),
          ...lineRows.map((l) => l.active_endpoint_id).filter((x): x is string => !!x),
        ]),
      );

      const { data: eps } = endpointIds.length
        ? await supabase
            .from('communication_endpoints')
            .select('id, external_address, display_name, provider, is_active')
            .in('id', endpointIds)
        : { data: [] as any[] };

      const byId = new Map(
        ((eps ?? []) as Array<{
          id: string;
          external_address: string | null;
          display_name: string | null;
          provider: string | null;
          is_active: boolean | null;
        }>).map((e) => [e.id, e]),
      );

      return lineRows.map((line) => {
        const build = (id: string, linkActive: boolean): SalesRouteConfigEndpoint => {
          const ep = byId.get(id);
          return {
            id,
            external_address: ep?.external_address ?? null,
            display_name: ep?.display_name ?? null,
            provider: ep?.provider ?? null,
            is_active: ep?.is_active ?? null,
            linkActive,
            isRouteActive: line.active_endpoint_id === id,
          };
        };

        const endpoints = linkRows
          .filter((l) => l.line_id === line.id && l.endpoint_id)
          .map((l) => build(l.endpoint_id as string, l.is_active === true))
          .sort((a, b) => Number(b.isRouteActive) - Number(a.isRouteActive));

        return {
          lineId: line.id,
          name: line.name,
          key: line.key,
          inboxKey: line.inbox_key,
          channel: line.channel,
          routeSlug: line.route_slug,
          isActive: line.is_active,
          activeEndpoint: line.active_endpoint_id ? build(line.active_endpoint_id, true) : null,
          endpoints,
        };
      });
    },
  });

  return { routes: query.data ?? [], isLoading: query.isLoading };
}
