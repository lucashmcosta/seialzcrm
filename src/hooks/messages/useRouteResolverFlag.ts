// ============================================================================
// Fase 2.5 — leitura da feature flag existente `conv_route_resolver_v2`.
// SOMENTE LEITURA: `feature_flags` só permite UPDATE para admin de plataforma
// (`is_admin_user()`), portanto a UI da organização apenas exibe o status.
//
// A leitura acontece em `useSalesFeatureFlags` (uma única query para as flags
// do módulo Comercial). A API pública deste hook permanece idêntica.
// ============================================================================

import { useSalesFeatureFlags, type FlagState } from './useSalesFeatureFlags';

export type RouteResolverFlagState = FlagState;

export function useRouteResolverFlag(organizationId?: string | null) {
  const { flags, isLoading } = useSalesFeatureFlags(organizationId);
  return { flag: flags.routeResolverV2, isLoading };
}
