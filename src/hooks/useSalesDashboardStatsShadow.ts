import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  buildRunKey,
  getRun,
  isParityMode,
  logFinalOnce,
  logScenarioOnce,
  plog,
  sumResourceTiming,
  type RunScope,
} from '@/lib/dashboardParityRun';

/**
 * Shadow (parity) reader for the new `get_sales_dashboard_stats` RPC.
 *
 * Diagnostic only — it never feeds the UI. Enabled exclusively with `?parity=1`.
 *
 * Guarantees:
 *  - the RPC runs EXACTLY ONCE per run (organizationId + from + to + ownerId);
 *  - the effect depends only on stable strings/booleans, never on React object identity;
 *  - an abandoned run aborts the in-flight request instead of just discarding it.
 */

export interface LegacyKpis {
  created_count: number;
  created_count_prev: number;
  won_count: number;
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

export interface LegacySnapshot {
  kpis: LegacyKpis;
  funnel: { name: string; count: number; value: number }[];
  trend: { date: string; created: number; won: number; wonValue: number }[];
  leaderboard: {
    userId: string;
    fullName: string;
    open: number;
    created: number;
    won: number;
    lost: number;
    wonValue: number;
  }[];
  isMonthly: boolean;
  locale: string;
}

interface Params {
  organizationId?: string;
  orgName?: string | null;
  from: Date;
  to: Date;
  ownerId: string;
  /** True once the legacy path finished for the current filters. */
  ready: boolean;
  /** Ref-backed reader — deliberately NOT a dependency. */
  getLegacy: () => LegacySnapshot | null;
}

const KPI_KEYS: (keyof LegacyKpis)[] = [
  'created_count',
  'created_count_prev',
  'won_count',
  'won_value',
  'won_value_prev',
  'lost_count',
  'lost_value',
  'win_rate',
  'win_rate_prev',
  'avg_ticket',
  'avg_cycle_days',
  'open_count',
  'open_value',
];

/** Approved tolerances: zero for counts/values, 0.05pp for rates, 0.01 for averages. */
const TOLERANCE: Record<string, number> = {
  win_rate: 0.05,
  win_rate_prev: 0.05,
  avg_ticket: 0.01,
  avg_cycle_days: 0.01,
};

const num = (v: unknown) => Number(v ?? 0);

const fmtDay = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDay = (s: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export function isParityModeEnabled(): boolean {
  return isParityMode();
}

export function useSalesDashboardStatsShadow({
  organizationId,
  orgName,
  from,
  to,
  ownerId,
  ready,
  getLegacy,
}: Params) {
  const getLegacyRef = useRef(getLegacy);
  getLegacyRef.current = getLegacy;

  const scope: RunScope | null = organizationId
    ? {
        organizationId,
        orgName,
        fromISO: from.toISOString(),
        toISO: to.toISOString(),
        ownerId,
      }
    : null;
  const runKey = scope ? buildRunKey(scope) : '';

  useEffect(() => {
    if (!isParityMode() || !runKey || !ready) return;

    const [orgId, fromISO, toISO, owner] = runKey.split('|');
    const run = getRun({ organizationId: orgId, orgName, fromISO, toISO, ownerId: owner });

    // Hard guard: one execution per runId, whatever React does.
    if (run.rpcStarted) return;
    run.rpcStarted = true;

    const controller = new AbortController();
    let aborted = false;

    (async () => {
      logScenarioOnce(run);
      run.rpcStart = performance.now();
      plog(run, 'RPC_START', run.rpcStart.toFixed(1));

      const fromDate = new Date(fromISO);
      const toDate = new Date(toISO);

      const { data, error } = await (supabase.rpc as any)('get_sales_dashboard_stats', {
        p_organization_id: orgId,
        p_from: fromISO,
        p_to: toISO,
        p_from_day: fmtDay(fromDate),
        p_to_day: fmtDay(toDate),
        p_owner_user_id: owner !== 'all' ? owner : null,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      }).abortSignal(controller.signal);

      if (aborted) return;

      run.rpcEnd = performance.now();
      run.rpcCallCount += 1;
      const timing = sumResourceTiming('/rest/v1/rpc/get_sales_dashboard_stats', run.rpcStart ?? 0);
      run.rpcNetworkMs = timing.durationMs;

      plog(run, 'RPC_END', run.rpcEnd.toFixed(1));
      plog(run, 'RPC_DURATION_MS', Math.round(run.rpcEnd - (run.rpcStart ?? run.rpcEnd)));
      plog(run, 'RPC_TRANSPORT_MS', Math.round(run.rpcNetworkMs));

      if (error) {
        run.rpcError = `${(error as any).code ?? ''} ${error.message}`.trim();
        run.parityResult = 'ERROR';
        // eslint-disable-next-line no-console
        console.error(`[dashboard-test][RUN ${run.runId}] RPC_ERROR:`, run.rpcError);
        logFinalOnce(run);
        return;
      }

      const legacy = getLegacyRef.current();
      if (!legacy) {
        run.parityResult = 'NO_LEGACY_SNAPSHOT';
        logFinalOnce(run);
        return;
      }

      const diffs = compareAll(run.runId, legacy, data);
      run.parityResult = diffs === 0 ? 'FULL MATCH' : `MISMATCH (${diffs} divergence(s))`;
      logFinalOnce(run);
    })().catch((e) => {
      if (aborted) return;
      run.rpcError = String(e?.message ?? e);
      run.parityResult = 'ERROR';
      // eslint-disable-next-line no-console
      console.error(`[dashboard-test][RUN ${run.runId}] RPC_ERROR:`, run.rpcError);
      logFinalOnce(run);
    });

    return () => {
      aborted = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, ready]);

  return { enabled: isParityMode() };
}

// ─────────────────────────────────────────
// Comparators
// ─────────────────────────────────────────

interface Row {
  metric: string;
  legacy: number | string;
  rpc: number | string;
  delta: number | string;
  match: string;
}

function cmp(metric: string, legacyValue: number, rpcValue: number): Row {
  const tol = TOLERANCE[metric] ?? 0;
  const delta = rpcValue - legacyValue;
  return {
    metric,
    legacy: round(legacyValue),
    rpc: round(rpcValue),
    delta: round(delta),
    match: Math.abs(delta) <= tol ? 'OK' : 'DIFF',
  };
}

const round = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(4)));

function compareAll(runId: string, legacy: LegacySnapshot, data: any): number {
  const prefix = `[dashboard-test][RUN ${runId}]`;
  let diffs = 0;

  // KPIs
  const k = data?.kpis ?? {};
  const kpiRows = KPI_KEYS.map((key) => cmp(key, num(legacy.kpis[key]), num(k[key])));
  diffs += kpiRows.filter((r) => r.match === 'DIFF').length;
  // eslint-disable-next-line no-console
  console.info(`${prefix} KPIs`);
  // eslint-disable-next-line no-console
  console.table(kpiRows);

  // Funnel — stage by stage, matched by name (legacy has no stage_id in the view model)
  const rpcFunnel: any[] = Array.isArray(data?.funnel) ? data.funnel : [];
  const rpcByName = new Map<string, any>(rpcFunnel.map((f) => [String(f.name), f]));
  const funnelRows: Row[] = [];
  legacy.funnel.forEach((stage) => {
    const r = rpcByName.get(stage.name);
    if (!r) {
      funnelRows.push({
        metric: `${stage.name}.count`,
        legacy: stage.count,
        rpc: 'MISSING',
        delta: '-',
        match: 'DIFF',
      });
      return;
    }
    funnelRows.push(cmp(`${stage.name}.count`, stage.count, num(r.count)));
    funnelRows.push(cmp(`${stage.name}.value`, stage.value, num(r.value)));
    rpcByName.delete(stage.name);
  });
  rpcByName.forEach((r, name) => {
    funnelRows.push({
      metric: `${name}.count`,
      legacy: 'MISSING',
      rpc: num(r.count),
      delta: '-',
      match: 'DIFF',
    });
  });
  diffs += funnelRows.filter((r) => r.match === 'DIFF').length;
  // eslint-disable-next-line no-console
  console.info(`${prefix} FUNNEL (${legacy.funnel.length} etapas)`);
  // eslint-disable-next-line no-console
  console.table(funnelRows);

  // Trend — bucketize the daily RPC output with the SAME rule the chart uses
  const rpcTrend: any[] = Array.isArray(data?.trend) ? data.trend : [];
  const bucketLabel = (d: Date) =>
    legacy.isMonthly
      ? d.toLocaleDateString(legacy.locale, { month: 'short', year: '2-digit' })
      : d.toLocaleDateString(legacy.locale, { day: '2-digit', month: '2-digit' });

  const rpcBuckets = new Map<string, { created: number; won: number; wonValue: number }>();
  rpcTrend.forEach((t) => {
    const label = bucketLabel(parseDay(String(t.bucket_date)));
    const acc = rpcBuckets.get(label) ?? { created: 0, won: 0, wonValue: 0 };
    acc.created += num(t.created);
    acc.won += num(t.won);
    acc.wonValue += num(t.won_value);
    rpcBuckets.set(label, acc);
  });

  const trendRows: Row[] = [];
  legacy.trend.forEach((p) => {
    const r = rpcBuckets.get(p.date) ?? { created: 0, won: 0, wonValue: 0 };
    trendRows.push(cmp(`${p.date}.created`, p.created, r.created));
    trendRows.push(cmp(`${p.date}.won`, p.won, r.won));
    trendRows.push(cmp(`${p.date}.wonValue`, p.wonValue, r.wonValue));
    rpcBuckets.delete(p.date);
  });
  rpcBuckets.forEach((r, label) => {
    trendRows.push({
      metric: `${label} (fora do eixo legado)`,
      legacy: 'MISSING',
      rpc: `${r.created}/${r.won}/${r.wonValue}`,
      delta: '-',
      match: 'DIFF',
    });
  });
  const trendDiffs = trendRows.filter((r) => r.match === 'DIFF');
  diffs += trendDiffs.length;
  // eslint-disable-next-line no-console
  console.info(
    `${prefix} TREND (${legacy.trend.length} buckets, ${legacy.isMonthly ? 'mensal' : 'diário'}) — ${trendDiffs.length} DIFF`,
  );
  // eslint-disable-next-line no-console
  console.table(trendDiffs.length > 0 ? trendDiffs : trendRows);

  // Leaderboard — seller by seller
  const rpcLb: any[] = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
  const rpcByUser = new Map<string, any>(rpcLb.map((l) => [String(l.user_id), l]));
  const lbRows: Row[] = [];
  legacy.leaderboard.forEach((u) => {
    const r = rpcByUser.get(u.userId);
    if (!r) {
      lbRows.push({
        metric: `${u.fullName}(${u.userId})`,
        legacy: `${u.open}/${u.created}/${u.won}/${u.lost}/${u.wonValue}`,
        rpc: 'MISSING',
        delta: '-',
        match: 'DIFF',
      });
      return;
    }
    lbRows.push(cmp(`${u.fullName}.open`, u.open, num(r.open)));
    lbRows.push(cmp(`${u.fullName}.created`, u.created, num(r.created)));
    lbRows.push(cmp(`${u.fullName}.won`, u.won, num(r.won)));
    lbRows.push(cmp(`${u.fullName}.lost`, u.lost, num(r.lost)));
    lbRows.push(cmp(`${u.fullName}.wonValue`, u.wonValue, num(r.won_value)));
    rpcByUser.delete(u.userId);
  });
  rpcByUser.forEach((r, uid) => {
    lbRows.push({
      metric: `${r.full_name}(${uid})`,
      legacy: 'MISSING',
      rpc: `${r.open}/${r.created}/${r.won}/${r.lost}/${r.won_value}`,
      delta: '-',
      match: 'DIFF',
    });
  });
  diffs += lbRows.filter((r) => r.match === 'DIFF').length;
  // eslint-disable-next-line no-console
  console.info(`${prefix} LEADERBOARD (${legacy.leaderboard.length} vendedores)`);
  // eslint-disable-next-line no-console
  console.table(lbRows);

  return diffs;
}
