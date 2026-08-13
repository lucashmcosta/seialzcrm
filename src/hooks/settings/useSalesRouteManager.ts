// ============================================================================
// Fase 3 — hook do manager do WhatsApp Comercial.
//
// Toda operação passa pela edge function `sales-route-operations`, que valida
// permissão administrativa no banco e usa RPCs atômicas. O frontend nunca
// escreve direto em communication_endpoints / messaging_line_endpoints.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SalesProvider = 'meta' | 'twilio' | 'evolution';

export interface ManagerEndpoint {
  endpointId: string;
  linkActive: boolean;
  isRouteActive: boolean;
  addressMasked: string | null;
  displayName: string | null;
  provider: SalesProvider | null;
  providerRaw: string | null;
  technicalStatus: string;
  enabled: boolean;
}

export interface ManagerRoute {
  lineId: string;
  name: string | null;
  routeSlug: string | null;
  isActive: boolean | null;
  activeEndpointId: string | null;
  endpoints: ManagerEndpoint[];
}

export interface ManagerInstance {
  instanceName: string;
  endpointId: string | null;
  technicalState: string;
  connected: boolean;
  checkedAt: string | null;
  identityKnown: boolean;
  identityMatchesEndpoint: boolean | null;
}

export interface ManagerStatus {
  organizationId: string;
  rules: { resolverV2: boolean; evolutionIntegration: boolean };
  capabilities: Record<SalesProvider, Record<string, boolean>>;
  routes: ManagerRoute[];
  evolutionInstances: ManagerInstance[];
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sales-route-operations', {
    body: payload,
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string; message?: string } & T;
  if (res && typeof res === 'object' && 'error' in res && res.error) {
    throw new Error(res.message ? `${res.error}: ${res.message}` : String(res.error));
  }
  return res as T;
}

export function useSalesRouteManager(organizationId?: string | null) {
  const qc = useQueryClient();
  const key = ['sales-route-manager', organizationId ?? null];

  const status = useQuery<ManagerStatus>({
    queryKey: key,
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: () => call<ManagerStatus>({ op: 'status', organizationId }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['sales-route-config'] });
  };

  const provisionEndpoint = useMutation({
    mutationFn: (input: {
      lineId: string;
      provider: SalesProvider;
      address: string;
      displayName?: string | null;
      instanceName?: string | null;
    }) => call<{ result: unknown }>({ op: 'provisionEndpoint', organizationId, ...input }),
    onSuccess: invalidate,
  });

  const setActiveEndpoint = useMutation({
    mutationFn: (input: { lineId: string; endpointId: string; reason?: string }) =>
      call<{ result: unknown }>({ op: 'setActiveEndpoint', organizationId, ...input }),
    onSuccess: invalidate,
  });

  const refreshEvolutionIdentity = useMutation({
    mutationFn: (input: { instanceName: string }) =>
      call<{ state: string }>({ op: 'refreshEvolutionIdentity', organizationId, ...input }),
    onSuccess: invalidate,
  });

  const restartInstance = useMutation({
    mutationFn: (input: { instanceName: string }) =>
      call<{ restarted: boolean }>({ op: 'restartInstance', organizationId, ...input }),
    onSuccess: invalidate,
  });

  return {
    status: status.data ?? null,
    isLoading: status.isLoading,
    error: status.error instanceof Error ? status.error.message : null,
    refetch: status.refetch,
    provisionEndpoint,
    setActiveEndpoint,
    refreshEvolutionIdentity,
    restartInstance,
  };
}

export function useCanManageIntegrations(organizationId?: string | null) {
  const query = useQuery<boolean>({
    queryKey: ['can-manage-integrations', organizationId ?? null],
    enabled: !!organizationId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_manage_integrations_in_org', {
        _org_id: organizationId as string,
      });
      if (error) return false;
      return data === true;
    },
  });
  return { canManage: query.data === true, isLoading: query.isLoading };
}
