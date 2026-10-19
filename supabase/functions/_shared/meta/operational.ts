export interface OperationalConnection {
  id: string; status: string; activation_state?: string; last_health?: string | null;
  expires_at?: string | null; data_access_expires_at?: string | null; granted_scopes?: string[];
}
export function operationallyReady(c: OperationalConnection, scopes: string[] = [], now = Date.now()) {
  return c.status === 'connected' && c.activation_state === 'ready' &&
    !['expired','error'].includes(c.last_health ?? '') &&
    [c.expires_at,c.data_access_expires_at].every(t => !t || Date.parse(t) > now) &&
    scopes.every(s => c.granted_scopes?.includes(s));
}
/** Stable explicit routing takes precedence over authorization recency. Never retry a write here. */
export function routedCandidates<T extends OperationalConnection>(connections: T[], route: {source: string; connection_id: string | null} | null, scopes: string[] = []) {
  if (route?.source === 'legacy') return [];
  const candidates = route?.connection_id ? connections.filter(c => c.id === route.connection_id) : connections;
  return candidates.filter(c => operationallyReady(c,scopes));
}
