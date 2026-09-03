import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Production reader for the home (/dashboard) aggregated stats.
 *
 * One call to `get_home_dashboard_stats` per filter combination
 * (organization + from + to + owner). No row-level `opportunities` load.
 */

export interface HomeKpis {
  created_count: number;
  created_count_prev: number;
  won_count: number;
  won_count_prev: number;
}

export interface HomeStatus {
  open: number;
  won: number;
  lost: number;
}

export interface HomeTrendRow {
  bucket_date: string;
  created: number;
  won: number;
}

export interface HomeStatsPayload {
  kpis: HomeKpis;
  status: HomeStatus;
  trend: HomeTrendRow[];
}

const EMPTY: HomeStatsPayload = {
  kpis: { created_count: 0, created_count_prev: 0, won_count: 0, won_count_prev: 0 },
  status: { open: 0, won: 0, lost: 0 },
  trend: [],
};

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Params {
  organizationId?: string;
  from: Date;
  to: Date;
  /** users.id or 'all' */
  ownerId: string;
  /** Only fetch once persisted filters finished hydrating. */
  enabled: boolean;
}

export function useHomeDashboardStats({ organizationId, from, to, ownerId, enabled }: Params) {
  const [data, setData] = useState<HomeStatsPayload>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  useEffect(() => {
    if (!organizationId || !enabled) return;

    const controller = new AbortController();
    let aborted = false;
    setLoading(true);

    (async () => {
      const { data: payload, error } = await (supabase.rpc as any)('get_home_dashboard_stats', {
        p_organization_id: organizationId,
        p_from: fromISO,
        p_to: toISO,
        p_from_day: fmtDay(new Date(fromISO)),
        p_to_day: fmtDay(new Date(toISO)),
        p_owner_user_id: ownerId !== 'all' ? ownerId : null,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      }).abortSignal(controller.signal);

      if (aborted) return;

      if (error) {
        console.error('useHomeDashboardStats error:', error);
        setData(EMPTY);
        setLoading(false);
        return;
      }

      setData({
        kpis: { ...EMPTY.kpis, ...(payload?.kpis ?? {}) } as HomeKpis,
        status: { ...EMPTY.status, ...(payload?.status ?? {}) } as HomeStatus,
        trend: Array.isArray(payload?.trend) ? payload.trend : [],
      });
      setLoading(false);
    })().catch((e) => {
      if (aborted) return;
      console.error('useHomeDashboardStats error:', e);
      setData(EMPTY);
      setLoading(false);
    });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [organizationId, fromISO, toISO, ownerId, enabled]);

  return { data, loading };
}
