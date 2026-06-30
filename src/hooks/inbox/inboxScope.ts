// Centralized scope rule for the Customer Service (CS) Inbox.
// SINGLE SOURCE OF TRUTH — both list and counters import from here.
//
// A thread is in CS scope when:
//   contact.lifecycle_stage = 'customer'
//     AND endpoint.purpose NOT IN ('commercial','vendor_personal')
//     (endpoint NULL, 'other', or 'customer_service' all pass)
//   OR (csIncludesServiceEndpoints opt-in) endpoint.purpose = 'customer_service'
//
// Phase 1 perf: the same scope rule now runs in Postgres via two RPCs
// (`rpc_list_inbox_threads`, `rpc_inbox_queue_counts`). The client passes
// `organization_id` explicitly so the planner can use the composite indexes
// `(organization_id, status, last_message_at DESC NULLS LAST)` and friends,
// instead of relying solely on RLS quals.

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
  last_routing_decision?: Record<string, unknown> | null;
  organization_id?: string | null;
  primary_endpoint_id: string | null;
  contact?: { id: string; name: string | null; phone: string | null; lifecycle_stage: string | null } | null;
  primary_endpoint?: { id: string; purpose: string | null; external_address?: string | null; provider?: string | null } | null;
}

export interface ScopeParams {
  tab: InboxTab;
  onlyMine: boolean;
  internalUserId: string | null;
  orgTimezone: string | null;
  /** REQUIRED for Phase 1 perf — enables composite-index usage in Postgres. */
  organizationId: string | null;
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

export async function fetchInboxScopedThreads(
  p: ScopeParams,
): Promise<{ rows: InboxScopedThread[]; debug: ScopeDebug }> {
  const empty = { rows: [] as InboxScopedThread[], debug: { bRaw: 0, bFiltered: 0, merged: 0 } };
  if (!p.organizationId) return empty;
  if (p.onlyMine && !p.internalUserId) return empty;

  const { data, error } = await supabase.rpc('rpc_list_inbox_threads', {
    p_organization_id: p.organizationId,
    p_tab: p.tab,
    p_only_mine: !!p.onlyMine,
    p_assigned_user_id: p.onlyMine ? p.internalUserId : null,
    p_resolved_since: startOfDayIso(p.orgTimezone),
    p_include_service_endpoints: !!p.csIncludesServiceEndpoints,
    p_limit: p.limit ?? 200,
  } as any);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[inboxScope] rpc_list_inbox_threads error:', error.message);
    return empty;
  }

  const rows = ((data ?? []) as unknown as InboxScopedThread[]);
  return {
    rows,
    debug: { bRaw: rows.length, bFiltered: rows.length, merged: rows.length },
  };
}

export interface ScopedCounts { active: number; waiting: number; resolved_today: number }

export async function fetchInboxScopedCounts(
  p: Omit<ScopeParams, 'tab'>,
): Promise<ScopedCounts> {
  const zero = { active: 0, waiting: 0, resolved_today: 0 };
  if (!p.organizationId) return zero;
  if (p.onlyMine && !p.internalUserId) return zero;

  const { data, error } = await supabase.rpc('rpc_inbox_queue_counts', {
    p_organization_id: p.organizationId,
    p_only_mine: !!p.onlyMine,
    p_assigned_user_id: p.onlyMine ? p.internalUserId : null,
    p_resolved_since: startOfDayIso(p.orgTimezone),
    p_include_service_endpoints: !!p.csIncludesServiceEndpoints,
  } as any);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[inboxScope] rpc_inbox_queue_counts error:', error.message);
    return zero;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    active: Number((row as any)?.active ?? 0),
    waiting: Number((row as any)?.waiting ?? 0),
    resolved_today: Number((row as any)?.resolved_today ?? 0),
  };
}
