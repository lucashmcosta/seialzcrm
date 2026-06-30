// Centralized scope rule for the Customer Service (CS) Inbox.
// SINGLE SOURCE OF TRUTH — both list and counters import from here.
//
// A thread is in CS scope when:
//   contact.lifecycle_stage = 'customer'
//     AND endpoint.purpose NOT IN ('commercial','vendor_personal')
//     (endpoint NULL, 'other', or 'customer_service' all pass)
//
// Unified rule (validada em Central Trabalhista e Viagi):
//   opportunity.status = 'won' → contact.lifecycle_stage = 'customer' → Atendimento.
// Endpoint NÃO é mais gatilho de CS enquanto os números forem mistos
// (Query A removida). A exclusão defensiva de purposes comerciais
// permanece e é aplicada client-side, pois o embed de endpoint é LEFT-join.

import { supabase } from '@/integrations/supabase/client';

export type InboxTab = 'active' | 'waiting' | 'resolved_today';

export const EXCLUDED_PURPOSES = ['commercial', 'vendor_personal'] as const;

export interface InboxScopedThread {
  id: string;
  contact_id: string | null;
  channel: string | null;
  status: string | null;
  priority: string | null;
  assigned_user_id: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  sla_first_response_target_at: string | null;
  sla_resolution_target_at: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_direction: string | null;
  resolved_at: string | null;
  last_inbound_at?: string | null;
  whatsapp_last_inbound_at?: string | null;
  organization_id?: string | null;
  primary_endpoint_id: string | null;
  contact?: { id: string; name: string | null; phone: string | null; lifecycle_stage: string | null } | null;
  primary_endpoint?: { id: string; purpose: string | null; external_address?: string | null } | null;
}

export interface ScopeParams {
  tab: InboxTab;
  onlyMine: boolean;
  internalUserId: string | null;
  orgTimezone: string | null;
  /**
   * Per-org flag. When true, the Inbox additionally includes threads whose
   * primary_endpoint.purpose = 'customer_service' regardless of the contact's
   * lifecycle_stage. Default false preserves the legacy "customer-only" rule.
   */
  csIncludesServiceEndpoints?: boolean;
  limit?: number;
}

export interface ScopeDebug {
  bRaw: number;
  bFiltered: number;
  cRaw?: number;
  merged: number;
}

const SELECT_B = `
  id, contact_id, channel, status, priority,
  assigned_user_id, assigned_at, first_response_at,
  sla_first_response_target_at, sla_resolution_target_at,
  last_message_at, last_message_content, last_message_direction, resolved_at,
  primary_endpoint_id,
  contact:contacts!inner ( id, name:full_name, phone, lifecycle_stage ),
  primary_endpoint:communication_endpoints ( id, purpose )
`;

/** Start of day in the org timezone, returned as an ISO (UTC) string.
 *  Falls back to UTC midnight when timezone is unknown. */
export function startOfDayIso(timezone: string | null): string {
  if (!timezone) {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  }
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const offsetMs = asUtc - now.getTime();
    const midnightUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - offsetMs;
    return new Date(midnightUtc).toISOString();
  } catch {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  }
}

function applyTabFilters(q: any, tab: InboxTab, orgTimezone: string | null) {
  switch (tab) {
    case 'active':
      return q.in('status', ['open', 'in_progress']);
    case 'waiting':
      return q.eq('status', 'awaiting_client');
    case 'resolved_today':
      return q.eq('status', 'resolved').gte('resolved_at', startOfDayIso(orgTimezone));
  }
}

function applyCommon(q: any, p: ScopeParams) {
  q = applyTabFilters(q, p.tab, p.orgTimezone);
  if (p.onlyMine && p.internalUserId) q = q.eq('assigned_user_id', p.internalUserId);
  q = q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(p.limit ?? 200);
  return q;
}

export async function fetchScopeB(
  p: ScopeParams,
): Promise<{ raw: InboxScopedThread[]; filtered: InboxScopedThread[] }> {
  if (p.onlyMine && !p.internalUserId) return { raw: [], filtered: [] };
  let q = supabase.from('message_threads').select(SELECT_B).eq('contact.lifecycle_stage', 'customer');
  q = applyCommon(q, p);
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[inboxScope] Query B error:', error.message);
    return { raw: [], filtered: [] };
  }
  const raw = (data ?? []) as unknown as InboxScopedThread[];
  const filtered = raw.filter((row) => {
    const purpose = row.primary_endpoint?.purpose ?? null;
    if (purpose && (EXCLUDED_PURPOSES as readonly string[]).includes(purpose)) return false;
    return true;
  });
  return { raw, filtered };
}

export async function fetchInboxScopedThreads(
  p: ScopeParams,
): Promise<{ rows: InboxScopedThread[]; debug: ScopeDebug }> {
  const b = await fetchScopeB(p);
  const rows = b.filtered
    .slice()
    .sort((x, y) => {
      const tx = x.last_message_at ? new Date(x.last_message_at).getTime() : 0;
      const ty = y.last_message_at ? new Date(y.last_message_at).getTime() : 0;
      return ty - tx;
    })
    .slice(0, p.limit ?? 200);
  return { rows, debug: { bRaw: b.raw.length, bFiltered: b.filtered.length, merged: rows.length } };
}

export interface ScopedCounts { active: number; waiting: number; resolved_today: number }

export async function fetchInboxScopedCounts(
  p: Omit<ScopeParams, 'tab'>,
): Promise<ScopedCounts> {
  // Reuse the EXACT same helper to guarantee list and counters never diverge.
  const [active, waiting, resolved_today] = await Promise.all([
    fetchInboxScopedThreads({ ...p, tab: 'active' }),
    fetchInboxScopedThreads({ ...p, tab: 'waiting' }),
    fetchInboxScopedThreads({ ...p, tab: 'resolved_today' }),
  ]);
  return {
    active: active.rows.length,
    waiting: waiting.rows.length,
    resolved_today: resolved_today.rows.length,
  };
}
