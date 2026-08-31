import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shadow (parity) reader for the new `get_sales_dashboard_stats` RPC.
 *
 * Purpose: validate "antigo × novo" BEFORE the cutover. It does NOT feed the UI.
 * Enabled only when the URL contains `?parity=1`, so it never runs for normal users.
 *
 * It logs a comparison table in the console:
 *   [dashboard-parity] metric | legacy | rpc | match
 */
export interface ShadowLegacyStats {
  createdCount: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  winRate: number;
  avgTicket: number;
  avgCycle: number;
  openCount: number;
  openValue: number;
}

interface Params {
  organizationId?: string;
  from: Date;
  to: Date;
  ownerId: string;
  legacy: ShadowLegacyStats | null;
  /** Changes whenever the legacy dataset finished loading for a new range. */
  refreshKey: string;
  ready: boolean;
}

const fmtDay = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function isParityModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('parity') === '1';
}

export function useSalesDashboardStatsShadow({
  organizationId,
  from,
  to,
  ownerId,
  legacy,
  refreshKey,
  ready,
}: Params) {
  const [rpcResult, setRpcResult] = useState<any>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isParityModeEnabled()) return;
    if (!organizationId || !ready || !legacy) return;

    let cancelled = false;
    (async () => {
      const startedAt = performance.now();
      const { data, error: rpcError } = await supabase.rpc('get_sales_dashboard_stats' as any, {
        p_organization_id: organizationId,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_from_day: fmtDay(from),
        p_to_day: fmtDay(to),
        p_owner_user_id: ownerId !== 'all' ? ownerId : null,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      });
      const took = performance.now() - startedAt;
      if (cancelled) return;

      setElapsedMs(took);
      if (rpcError) {
        setError(rpcError.message);
        console.error('[dashboard-parity] RPC error:', rpcError.message);
        return;
      }
      setError(null);
      setRpcResult(data);

      const k = (data as any)?.kpis ?? {};
      const num = (v: unknown) => Number(v ?? 0);
      const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

      const rows = [
        ['created_count', legacy.createdCount, num(k.created_count)],
        ['won_count', legacy.wonCount, num(k.won_count)],
        ['won_value', legacy.wonValue, num(k.won_value)],
        ['lost_count', legacy.lostCount, num(k.lost_count)],
        ['lost_value', legacy.lostValue, num(k.lost_value)],
        ['open_count', legacy.openCount, num(k.open_count)],
        ['open_value', legacy.openValue, num(k.open_value)],
        ['win_rate', legacy.winRate, num(k.win_rate)],
        ['avg_ticket', legacy.avgTicket, num(k.avg_ticket)],
        ['avg_cycle_days', legacy.avgCycle, num(k.avg_cycle_days)],
      ] as Array<[string, number, number]>;

      const table = rows.map(([metric, legacyValue, rpcValue]) => ({
        metric,
        legacy: legacyValue,
        rpc: rpcValue,
        match: near(legacyValue, rpcValue) ? 'OK' : 'DIFF',
      }));

      if (loggedFor.current !== refreshKey) {
        loggedFor.current = refreshKey;
        const diffs = table.filter((r) => r.match === 'DIFF');
        console.info(
          `[dashboard-parity] RPC took ${took.toFixed(0)}ms — ${diffs.length === 0 ? 'FULL MATCH' : `${diffs.length} divergence(s)`}`,
        );
        console.table(table);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, refreshKey, ownerId, ready, legacy]);

  return { rpcResult, elapsedMs, error, enabled: isParityModeEnabled() };
}
