import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Production reader for the aggregated sales dashboard.
 *
 * One call to `get_sales_dashboard_stats` per filter combination
 * (organization + from + to + owner). No row-level `opportunities` load.
 */

export interface DashboardKpis {
  created_count: number;
  created_count_prev: number;
  won_count: number;
  won_count_prev: number;
  won_value: number;
  won_value_prev: number;

  lost_count: number;
  lost_value: number;
  win_rate: number;
  win_rate_prev: number;
  avg_ticket: number;
  avg_cycle_days: number;
  open_count: number;
  open_value: number;
}

export interface DashboardFunnelRow {
  name: string;
  count: number;
  value: number;
}

export interface DashboardTrendRow {
  bucket_date: string;
  created: number;
  won: number;
  won_value: number;
}

export interface DashboardLeaderboardRow {
  user_id: string;
  full_name: string | null;
  open: number;
  created: number;
  won: number;
  lost: number;
  won_value: number;
}

export interface DashboardStatsPayload {
  kpis: Partial<DashboardKpis>;
  funnel: DashboardFunnelRow[];
  trend: DashboardTrendRow[];
  leaderboard: DashboardLeaderboardRow[];
}

const EMPTY: DashboardStatsPayload = { kpis: {}, funnel: [], trend: [], leaderboard: [] };

const fmtDay = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface Params {
  organizationId?: string;
  from: Date;
  to: Date;
  /** users.id or 'all' */
  ownerId: string;
  /**
   * Explicit previous window, only for calendar presets with special semantics
   * (`this_week` / `this_month`). When omitted/null the RPC keeps its own
   * same-duration previous window.
   */
  previousRange?: { from: Date; toExclusive: Date } | null;
  /** Only fetch once persisted filters finished hydrating. */
  enabled: boolean;
}

export function useSalesDashboardStats({
  organizationId,
  from,
  to,
  ownerId,
  previousRange,
  enabled,
}: Params) {
  const [data, setData] = useState<DashboardStatsPayload>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fromISO = from.toISOString();
  const toISO = to.toISOString();
  const prevFromISO = previousRange ? previousRange.from.toISOString() : null;
  const prevToISO = previousRange ? previousRange.toExclusive.toISOString() : null;
  const prevFromDay = previousRange ? fmtDay(previousRange.from) : null;
  const prevToDay = previousRange ? fmtDay(previousRange.toExclusive) : null;

  useEffect(() => {
    if (!organizationId || !enabled) return;

    const controller = new AbortController();
    let aborted = false;
    setLoading(true);

    (async () => {
      const fromDate = new Date(fromISO);
      const toDate = new Date(toISO);

      const { data: payload, error } = await (supabase.rpc as any)('get_sales_dashboard_stats', {
        p_organization_id: organizationId,
        p_from: fromISO,
        p_to: toISO,
        p_from_day: fmtDay(fromDate),
        p_to_day: fmtDay(toDate),
        p_owner_user_id: ownerId !== 'all' ? ownerId : null,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        p_prev_from: prevFromISO,
        p_prev_to: prevToISO,
        p_prev_from_day: prevFromDay,
        p_prev_to_day: prevToDay,
      }).abortSignal(controller.signal);


      if (aborted) return;

      if (error) {
        console.error('useSalesDashboardStats error:', error);
        setData(EMPTY);
        setLoading(false);
        return;
      }

      setData({
        kpis: (payload?.kpis ?? {}) as Partial<DashboardKpis>,
        funnel: Array.isArray(payload?.funnel) ? payload.funnel : [],
        trend: Array.isArray(payload?.trend) ? payload.trend : [],
        leaderboard: Array.isArray(payload?.leaderboard) ? payload.leaderboard : [],
      });
      setLoading(false);
    })().catch((e) => {
      if (aborted) return;
      console.error('useSalesDashboardStats error:', e);
      setData(EMPTY);
      setLoading(false);
    });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [
    organizationId,
    fromISO,
    toISO,
    ownerId,
    enabled,
    prevFromISO,
    prevToISO,
    prevFromDay,
    prevToDay,
  ]);


  return { data, loading };
}
