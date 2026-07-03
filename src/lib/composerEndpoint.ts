// Endpoint selection heuristic used by both /messages and /inbox composers.
// Extracted from NewConversationDialog so all entry points share the same
// preference order: Meta+Brasil > Brasil > Meta > outros; tie-break by
// created_at DESC.
//
// The `intent` argument narrows the pool by `communication_endpoints.purpose`
// (see `endpointPurpose.ts`). When intent is omitted, the full pool is used.

import type { OrgEndpoint } from '@/hooks/useOrgWhatsAppEndpoints';
import { purposesForIntent, type ComposerIntent } from './endpointPurpose';

function endpointRank(ep: OrgEndpoint): number {
  const digits = ep.external_address.replace(/\D/g, '');
  const isBrazil = digits.startsWith('55');
  const isMeta = ep.provider === 'meta_cloud_api';
  if (isMeta && isBrazil) return 0;
  if (isBrazil) return 1;
  if (isMeta) return 2;
  return 3;
}

export function filterEndpointsByIntent(
  endpoints: OrgEndpoint[],
  intent?: ComposerIntent,
): OrgEndpoint[] {
  if (!intent) return endpoints;
  const allowed = purposesForIntent(intent);
  return endpoints.filter((ep) => ep.purpose && (allowed as readonly string[]).includes(ep.purpose));
}

export function orderEndpointsByPreference(endpoints: OrgEndpoint[]): OrgEndpoint[] {
  return [...endpoints].sort((a, b) => {
    const byRank = endpointRank(a) - endpointRank(b);
    if (byRank !== 0) return byRank;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * Returns the preferred endpoint for a given intent, or null when the pool
 * is empty. Never throws.
 */
export function pickPreferredEndpoint(
  endpoints: OrgEndpoint[],
  intent?: ComposerIntent,
): OrgEndpoint | null {
  const pool = filterEndpointsByIntent(endpoints, intent);
  if (pool.length === 0) return null;
  return orderEndpointsByPreference(pool)[0] ?? null;
}
