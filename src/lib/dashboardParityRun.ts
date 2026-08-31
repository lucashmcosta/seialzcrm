/**
 * Diagnostic-only run registry for the `/dashboards` parity test.
 *
 * Purpose: measure the legacy path (paginated `opportunities` fetches) against the
 * new `get_sales_dashboard_stats` RPC in the SAME session, with the SAME filters,
 * and guarantee the RPC executes EXACTLY ONCE per run.
 *
 * Everything here is inert unless the URL contains `?parity=1`.
 * State lives at module scope on purpose — it must survive re-renders, StrictMode
 * double-mounts and identity changes of React objects (`stats`, `legacy`, ...).
 */

export interface RunScope {
  organizationId: string;
  orgName?: string | null;
  fromISO: string;
  toISO: string;
  ownerId: string;
}

export interface RunRecord {
  runId: string;
  key: string;
  scope: RunScope;
  /** performance.now() at fetchData() start */
  legacyStart?: number;
  legacyEnd?: number;
  legacyRequestCount: number;
  legacyRows: number;
  legacyNetworkMs?: number;
  legacyBytes?: number;
  uiReadyMs?: number;
  renderCount: number;
  rpcStarted: boolean;
  rpcStart?: number;
  rpcEnd?: number;
  rpcCallCount: number;
  rpcNetworkMs?: number;
  rpcError?: string;
  parityResult?: string;
  scenarioLogged: boolean;
  finalLogged: boolean;
}

const runs = new Map<string, RunRecord>();

export function isParityMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('parity') === '1';
}

export function buildRunKey(scope: RunScope): string {
  return `${scope.organizationId}|${scope.fromISO}|${scope.toISO}|${scope.ownerId}`;
}

/** Deterministic short id derived from the stable run key. */
export function runIdFor(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i += 1) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).padStart(6, '0').slice(-6);
}

export function getRun(scope: RunScope): RunRecord {
  const key = buildRunKey(scope);
  const existing = runs.get(key);
  if (existing) return existing;

  const record: RunRecord = {
    runId: runIdFor(key),
    key,
    scope,
    legacyRequestCount: 0,
    legacyRows: 0,
    renderCount: 0,
    rpcStarted: false,
    rpcCallCount: 0,
    scenarioLogged: false,
    finalLogged: false,
  };
  runs.set(key, record);
  return record;
}

export function peekRun(key: string): RunRecord | undefined {
  return runs.get(key);
}

export function plog(run: RunRecord, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.info(`[dashboard-test][RUN ${run.runId}]`, ...args);
}

export function logScenarioOnce(run: RunRecord): void {
  if (run.scenarioLogged) return;
  run.scenarioLogged = true;
  plog(
    run,
    'scenario',
    `org=${run.scope.orgName || run.scope.organizationId}`,
    `from=${run.scope.fromISO}`,
    `to=${run.scope.toISO}`,
    `owner=${run.scope.ownerId}`,
  );
}

/** Legacy path: one page fetched. */
export function noteLegacyRequest(run: RunRecord, rows: number): void {
  run.legacyRequestCount += 1;
  run.legacyRows += rows;
}

export function startLegacy(run: RunRecord): void {
  run.legacyStart = performance.now();
  run.legacyEnd = undefined;
  run.legacyRequestCount = 0;
  run.legacyRows = 0;
  run.uiReadyMs = undefined;
  logScenarioOnce(run);
  plog(run, 'LEGACY_START', run.legacyStart.toFixed(1));
}

export function endLegacy(run: RunRecord): void {
  run.legacyEnd = performance.now();
  const timing = sumResourceTiming('/rest/v1/opportunities', run.legacyStart ?? 0);
  run.legacyNetworkMs = timing.durationMs;
  run.legacyBytes = timing.bytes;

  plog(run, 'LEGACY_END', run.legacyEnd.toFixed(1));
  plog(run, 'LEGACY_DURATION_MS', Math.round(run.legacyEnd - (run.legacyStart ?? run.legacyEnd)));
  plog(run, 'LEGACY_REQUEST_COUNT', run.legacyRequestCount);
  plog(run, 'LEGACY_ROWS_DOWNLOADED', run.legacyRows);
  plog(
    run,
    `LEGACY_NETWORK_MS ${Math.round(run.legacyNetworkMs)}`,
    `LEGACY_BYTES ${formatBytes(run.legacyBytes)}`,
  );
}

export function noteRender(run: RunRecord): void {
  run.renderCount += 1;
}

export function noteUiReady(run: RunRecord): void {
  if (run.uiReadyMs != null || run.legacyStart == null) return;
  run.uiReadyMs = performance.now() - run.legacyStart;
  plog(run, 'UI_READY_MS', Math.round(run.uiReadyMs));
}

export function logFinalOnce(run: RunRecord): void {
  if (run.finalLogged) return;
  run.finalLogged = true;

  plog(run, 'RPC_CALL_COUNT', run.rpcCallCount);
  plog(run, 'REPORTS_RENDER_COUNT', run.renderCount);
  if (run.legacyStart != null && run.rpcEnd != null) {
    plog(run, 'USER_PERCEIVED_MS', Math.round(run.rpcEnd - run.legacyStart));
  }
  plog(run, 'PARITY_RESULT', run.parityResult ?? 'N/A');
}

interface ResourceSummary {
  durationMs: number;
  bytes: number;
}

/** Sums PerformanceResourceTiming entries matching `needle` started after `sinceMs`. */
export function sumResourceTiming(needle: string, sinceMs: number): ResourceSummary {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) {
    return { durationMs: 0, bytes: 0 };
  }
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  let durationMs = 0;
  let bytes = 0;
  for (const e of entries) {
    if (!e.name.includes(needle)) continue;
    if (e.startTime < sinceMs) continue;
    durationMs += e.duration;
    bytes += e.transferSize || 0;
  }
  return { durationMs, bytes };
}

export function formatBytes(n?: number): string {
  if (!n) return '0B';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
