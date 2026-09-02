/**
 * TEMPORARY instrumentation for the /dashboard (Início) shadow parity test.
 *
 * Completely inert unless `?parity=1` is in the URL or
 * `localStorage.homeParityMode === '1'`.
 *
 * Removed at cutover.
 */

console.log('[home-test] HOME_PARITY_MODULE_IMPORTED');

const PREFIX = '[home-test]';

export function isHomeParityMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('parity') === '1') return true;
    return window.localStorage.getItem('homeParityMode') === '1';
  } catch {
    return false;
  }
}

export function buildRunKey(p: {
  organizationId: string;
  fromISO: string;
  toISO: string;
  ownerId: string;
  canViewAll: boolean;
}): string {
  return `${p.organizationId}|${p.fromISO}|${p.toISO}|${p.ownerId}|${p.canViewAll ? 'all' : 'self'}`;
}

export function runIdOf(runKey: string): string {
  let h = 5381;
  for (let i = 0; i < runKey.length; i += 1) {
    h = ((h << 5) + h + runKey.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}

type RunState = 'idle' | 'running' | 'done';

interface RunRecord {
  state: RunState;
  rpcCallCount: number;
  legacyStart?: number;
  legacyEnd?: number;
  legacyRequests: number;
  legacyRows: number;
  renders: number;
}

const runs = new Map<string, RunRecord>();

function rec(runId: string): RunRecord {
  let r = runs.get(runId);
  if (!r) {
    r = { state: 'idle', rpcCallCount: 0, legacyRequests: 0, legacyRows: 0, renders: 0 };
    runs.set(runId, r);
  }
  return r;
}

export function log(runId: string, ...args: unknown[]) {
  console.log(`${PREFIX}[RUN ${runId}]`, ...args);
}

// ---------- legacy path instrumentation ----------

export function startLegacy(runId: string) {
  const r = rec(runId);
  r.legacyStart = performance.now();
  r.legacyEnd = undefined;
  r.legacyRequests = 0;
  r.legacyRows = 0;
  log(runId, 'LEGACY_START');
}

export function noteRequest(runId: string, rows: number) {
  const r = rec(runId);
  r.legacyRequests += 1;
  r.legacyRows += rows;
}

export function endLegacy(runId: string) {
  const r = rec(runId);
  r.legacyEnd = performance.now();
  const ms = r.legacyStart != null ? Math.round(r.legacyEnd - r.legacyStart) : -1;
  log(runId, 'LEGACY_END');
  log(runId, 'LEGACY_DURATION_MS', ms);
  log(runId, 'LEGACY_REQUEST_COUNT', r.legacyRequests);
  log(runId, 'LEGACY_ROWS_DOWNLOADED', r.legacyRows);
}

export function noteRender(runId: string) {
  rec(runId).renders += 1;
}

export function renderCount(runId: string): number {
  return rec(runId).renders;
}

export function legacyDuration(runId: string): number | null {
  const r = rec(runId);
  if (r.legacyStart == null || r.legacyEnd == null) return null;
  return Math.round(r.legacyEnd - r.legacyStart);
}

// ---------- RPC single-call guard ----------

export function tryClaimRun(runId: string): boolean {
  const r = rec(runId);
  if (r.state !== 'idle') {
    log(runId, `RPC_SKIP state=${r.state}`);
    return false;
  }
  r.state = 'running';
  return true;
}

export function releaseRun(runId: string) {
  const r = rec(runId);
  if (r.state === 'running') r.state = 'idle';
}

export function finishRun(runId: string) {
  rec(runId).state = 'done';
}

export function noteRpcCall(runId: string) {
  const r = rec(runId);
  r.rpcCallCount += 1;
  return r.rpcCallCount;
}

export function rpcCallCount(runId: string): number {
  return rec(runId).rpcCallCount;
}

// ---------- snapshots & comparison ----------

export interface HomeSnapshot {
  created: number;
  won: number;
  createdPrev: number;
  wonPrev: number;
  statusOpen: number;
  statusWon: number;
  statusLost: number;
  /** key = YYYY-MM-DD (local), value = [created, won] */
  trend: Record<string, [number, number]>;
}

const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface LegacyOppRow {
  created_at: string;
  status: string;
  close_date: string | null;
}

/**
 * Rebuilds, from the rows the legacy path already downloaded, exactly what the
 * screen shows today — using the same arithmetic as Dashboard.tsx,
 * DashboardStatusDonut and DashboardTrendChart (daily granularity).
 */
export function legacySnapshot(
  rows: LegacyOppRow[],
  from: Date,
  to: Date,
  createdPrev: number,
  wonPrev: number,
): HomeSnapshot {
  const fromMs = from.getTime();
  const toMs = to.getTime();

  let created = 0;
  let won = 0;
  let statusOpen = 0;
  let statusWon = 0;
  let statusLost = 0;
  const trend: Record<string, [number, number]> = {};

  const bump = (key: string, idx: 0 | 1) => {
    const cur = trend[key] || [0, 0];
    cur[idx] += 1;
    trend[key] = cur;
  };

  for (const r of rows) {
    const c = new Date(r.created_at);
    const inCreated = c.getTime() >= fromMs && c.getTime() <= toMs;
    if (inCreated) {
      created += 1;
      bump(dayKey(c), 0);
      if (r.status === 'won') statusWon += 1;
      else if (r.status === 'lost') statusLost += 1;
      else statusOpen += 1;
    }
    if (r.status === 'won' && r.close_date) {
      const d = parseLocalDate(r.close_date);
      if (d && d.getTime() >= fromMs && d.getTime() <= toMs) {
        won += 1;
        bump(dayKey(d), 1);
      }
    }
  }

  return { created, won, createdPrev, wonPrev, statusOpen, statusWon, statusLost, trend };
}

export interface RpcPayload {
  kpis?: {
    created_count?: number;
    created_count_prev?: number;
    won_count?: number;
    won_count_prev?: number;
  };
  status?: { open?: number; won?: number; lost?: number };
  trend?: { bucket_date: string; created: number; won: number }[];
}

export function rpcSnapshot(payload: RpcPayload): HomeSnapshot {
  const trend: Record<string, [number, number]> = {};
  for (const b of payload.trend ?? []) {
    const key = String(b.bucket_date).slice(0, 10);
    trend[key] = [Number(b.created) || 0, Number(b.won) || 0];
  }
  return {
    created: Number(payload.kpis?.created_count) || 0,
    won: Number(payload.kpis?.won_count) || 0,
    createdPrev: Number(payload.kpis?.created_count_prev) || 0,
    wonPrev: Number(payload.kpis?.won_count_prev) || 0,
    statusOpen: Number(payload.status?.open) || 0,
    statusWon: Number(payload.status?.won) || 0,
    statusLost: Number(payload.status?.lost) || 0,
    trend,
  };
}

const conversion = (won: number, created: number): number | null =>
  created > 0 ? (won / created) * 100 : null;

const delta = (curr: number, prev: number): number | null => {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
};

export function compare(runId: string, legacy: HomeSnapshot, rpc: HomeSnapshot): boolean {
  const rows: Record<string, unknown>[] = [];
  let ok = true;

  const cmpCount = (metric: string, a: number, b: number) => {
    const match = a === b;
    if (!match) ok = false;
    rows.push({ metric, legacy: a, rpc: b, delta: b - a, match: match ? 'OK' : 'DIFF' });
  };

  const cmpPct = (metric: string, a: number | null, b: number | null) => {
    const norm = (v: number | null) => (v == null || !isFinite(v) ? null : v);
    const va = norm(a);
    const vb = norm(b);
    let match: boolean;
    if (va == null || vb == null) match = va === vb;
    else match = Math.abs(va - vb) <= 0.05;
    if (!match) ok = false;
    rows.push({
      metric,
      legacy: va == null ? '—' : va.toFixed(4),
      rpc: vb == null ? '—' : vb.toFixed(4),
      delta: va != null && vb != null ? (vb - va).toFixed(4) : '—',
      match: match ? 'OK' : 'DIFF',
    });
  };

  cmpCount('Criadas', legacy.created, rpc.created);
  cmpCount('Ganhas', legacy.won, rpc.won);
  cmpCount('Criadas (anterior)', legacy.createdPrev, rpc.createdPrev);
  cmpCount('Ganhas (anterior)', legacy.wonPrev, rpc.wonPrev);
  cmpCount('Status open', legacy.statusOpen, rpc.statusOpen);
  cmpCount('Status won', legacy.statusWon, rpc.statusWon);
  cmpCount('Status lost', legacy.statusLost, rpc.statusLost);

  cmpPct('Conversão', conversion(legacy.won, legacy.created), conversion(rpc.won, rpc.created));
  cmpPct(
    'Conversão (anterior)',
    conversion(legacy.wonPrev, legacy.createdPrev),
    conversion(rpc.wonPrev, rpc.createdPrev),
  );
  cmpPct('Delta Criadas', delta(legacy.created, legacy.createdPrev), delta(rpc.created, rpc.createdPrev));
  cmpPct('Delta Ganhas', delta(legacy.won, legacy.wonPrev), delta(rpc.won, rpc.wonPrev));
  cmpPct(
    'Delta Conversão',
    delta(conversion(legacy.won, legacy.created) ?? 0, conversion(legacy.wonPrev, legacy.createdPrev) ?? 0),
    delta(conversion(rpc.won, rpc.created) ?? 0, conversion(rpc.wonPrev, rpc.createdPrev) ?? 0),
  );

  console.table(rows);

  // Trend, bucket by bucket. Legacy only has buckets with data; RPC has every day.
  const keys = Array.from(new Set([...Object.keys(legacy.trend), ...Object.keys(rpc.trend)])).sort();
  const trendRows: Record<string, unknown>[] = [];
  let trendOk = true;
  for (const k of keys) {
    const [lc, lw] = legacy.trend[k] || [0, 0];
    const [rc, rw] = rpc.trend[k] || [0, 0];
    const match = lc === rc && lw === rw;
    if (!match) {
      trendOk = false;
      ok = false;
    }
    if (!match || lc || lw || rc || rw) {
      trendRows.push({
        bucket: k,
        legacy_created: lc,
        rpc_created: rc,
        legacy_won: lw,
        rpc_won: rw,
        match: match ? 'OK' : 'DIFF',
      });
    }
  }
  log(runId, `TREND_BUCKETS ${keys.length} ${trendOk ? 'OK' : 'DIFF'}`);
  if (!trendOk) console.table(trendRows);

  log(runId, 'PARITY_RESULT', ok ? 'FULL MATCH' : 'MISMATCH');
  return ok;
}
