import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  buildRunKey,
  compare,
  finishRun,
  isHomeParityMode,
  legacyDuration,
  log,
  noteRpcCall,
  releaseRun,
  renderCount,
  rpcCallCount,
  rpcSnapshot,
  runIdOf,
  tryClaimRun,
  type HomeSnapshot,
  type RpcPayload,
} from '@/lib/homeParityRun';

console.log('[home-test] HOME_SHADOW_HOOK_IMPORTED');

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Params {
  organizationId?: string;
  from: Date;
  to: Date;
  /** users.id or 'all' */
  ownerId: string;
  canViewAll: boolean;
  /** Persisted filters finished hydrating. */
  filtersHydrated: boolean;
  /** Legacy path finished loading for this exact filter combination. */
  legacyReady: boolean;
  /** Reads the legacy snapshot without entering the dependency array. */
  getLegacy: () => HomeSnapshot | null;
}

/**
 * SHADOW ONLY — calls get_home_dashboard_stats and compares it against the
 * legacy numbers. Never feeds the UI. Inert unless parity mode is on.
 */
export function useHomeDashboardStatsShadow({
  organizationId,
  from,
  to,
  ownerId,
  canViewAll,
  filtersHydrated,
  legacyReady,
  getLegacy,
}: Params) {
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  useEffect(() => {
    if (!isHomeParityMode()) return;
    if (!organizationId || !filtersHydrated || !legacyReady) return;

    const runKey = buildRunKey({ organizationId, fromISO, toISO, ownerId, canViewAll });
    const runId = runIdOf(runKey);

    if (!tryClaimRun(runId)) return;

    const controller = new AbortController();
    let aborted = false;

    (async () => {
      log(
        runId,
        `scenario org=${organizationId} from=${fromISO} to=${toISO} owner=${ownerId} viewAll=${canViewAll}`,
      );

      const t0 = performance.now();
      noteRpcCall(runId);

      const { data, error } = await (supabase.rpc as any)('get_home_dashboard_stats', {
        p_organization_id: organizationId,
        p_from: fromISO,
        p_to: toISO,
        p_from_day: fmtDay(new Date(fromISO)),
        p_to_day: fmtDay(new Date(toISO)),
        p_owner_user_id: ownerId !== 'all' ? ownerId : null,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      }).abortSignal(controller.signal);

      const ms = Math.round(performance.now() - t0);

      if (aborted) {
        log(runId, 'RPC_ABORTED');
        releaseRun(runId);
        return;
      }

      log(runId, 'RPC_DURATION_MS', ms);
      log(runId, 'RPC_CALL_COUNT', rpcCallCount(runId));
      log(runId, 'LEGACY_DURATION_MS(recap)', legacyDuration(runId));
      log(runId, 'RENDER_COUNT', renderCount(runId));

      if (error) {
        log(runId, 'RPC_ERROR', error.code ?? '', error.message ?? String(error));
        log(runId, 'PARITY_RESULT', 'ERROR');
        finishRun(runId);
        return;
      }

      const legacy = getLegacy();
      if (!legacy) {
        log(runId, 'PARITY_RESULT', 'NO_LEGACY_SNAPSHOT');
        finishRun(runId);
        return;
      }

      compare(runId, legacy, rpcSnapshot((data ?? {}) as RpcPayload));
      finishRun(runId);
    })().catch((e) => {
      if (aborted) {
        releaseRun(runId);
        return;
      }
      log(runId, 'RPC_ERROR', (e as Error)?.message ?? String(e));
      log(runId, 'PARITY_RESULT', 'ERROR');
      finishRun(runId);
    });

    return () => {
      aborted = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, fromISO, toISO, ownerId, canViewAll, filtersHydrated, legacyReady]);
}
