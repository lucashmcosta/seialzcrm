import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, AlertTriangle, CheckCircle2, AlertOctagon, Bug } from 'lucide-react';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Window = '1h' | '24h' | '7d';

const WINDOW_TO_INTERVAL: Record<Window, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
};
const WINDOW_TO_MS: Record<Window, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

interface InboundHealthRow {
  integration_slug: string;
  status: string;
  count: number;
  avg_latency_sec: number | null;
  p95_latency_sec: number | null;
}
interface InboundEvent {
  id: string; received_at: string; integration_slug: string;
  source_event: string | null; process_status: string;
  shadow_mode: boolean | null; signature_valid: boolean | null;
  retry_count: number | null; trace_id: string | null;
  external_id: string | null; organization_id: string | null;
  process_error: string | null; processed_at?: string | null;
  raw_payload?: any; raw_headers?: any;
}
interface IngestError {
  id: string; created_at: string; integration_slug: string;
  error_code: string | null; error_message: string | null;
  trace_id: string | null; external_id: string | null;
}
interface OutboxHealth {
  pending: number; running: number; running_stuck_5m: number;
  failed: number; dead_letter: number; success_24h: number; failed_24h: number;
  subscriptions_active: number; subscriptions_paused: number;
  worker_last_run_at: string | null; reaper_last_run_at: string | null;
  generated_at: string;
}
interface IntegrationJob {
  id: string; created_at: string; integration_slug: string;
  target_action: string; status: string; attempts: number | null;
  max_attempts: number | null; next_run_at: string | null;
  organization_id: string | null; last_error: string | null;
  idempotency_key: string | null; payload?: any; external_response?: any;
}
interface Subscription {
  id: string; integration_slug: string; event_type: string;
  target_action: string; is_active: boolean; paused_until: string | null;
}

// ------------------------------------------------------------------
// Debug instrumentation
// ------------------------------------------------------------------

type ProbeStatus = 'ok' | 'empty' | 'error' | 'pending';
interface Probe {
  key: string;
  label: string;
  source: string;           // rpc / table name
  type: 'rpc' | 'table' | 'rpc+fallback';
  window?: string;
  filters?: string;
  rows: number;
  latency_ms: number;
  status: ProbeStatus;
  fallback_used?: boolean;
  error?: string;
}

class ProbeRegistry {
  private map = new Map<string, Probe>();
  set(p: Probe) { this.map.set(p.key, p); }
  get all() { return Array.from(this.map.values()); }
  clear() { this.map.clear(); }
}

async function instrument<T>(
  registry: ProbeRegistry,
  meta: Omit<Probe, 'rows' | 'latency_ms' | 'status'>,
  fn: () => Promise<{ data: T | null; error: any; count?: number | null }>,
): Promise<{ data: T | null; error: any; count?: number | null }> {
  const t0 = performance.now();
  try {
    const r = await fn();
    const ms = Math.round(performance.now() - t0);
    const rows = r.count != null ? r.count : Array.isArray(r.data) ? r.data.length : (r.data ? 1 : 0);
    registry.set({
      ...meta,
      rows,
      latency_ms: ms,
      status: r.error ? 'error' : rows === 0 ? 'empty' : 'ok',
      error: r.error?.message,
    });
    return r;
  } catch (e: any) {
    registry.set({ ...meta, rows: 0, latency_ms: Math.round(performance.now() - t0), status: 'error', error: e.message });
    return { data: null, error: e };
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function fmtTime(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}
function fmtRelative(ts: string | null | undefined) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'processed': case 'success': return 'default';
    case 'received': case 'pending': case 'processing': case 'running': return 'secondary';
    case 'retry': return 'outline';
    case 'dead_letter': case 'failed': case 'expired': return 'destructive';
    default: return 'outline';
  }
}
function p95(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}
function p50(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.5)];
}
function fmtLatency(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 1) return `${Math.round(sec * 1000)}ms`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

// ------------------------------------------------------------------
// Stat Card
// ------------------------------------------------------------------

function StatCard({
  label, value, hint, tone = 'default', probeKey, registry, debug,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'warning' | 'critical' | 'success';
  probeKey?: string;
  registry?: ProbeRegistry;
  debug?: boolean;
}) {
  const toneClass =
    tone === 'critical' ? 'text-destructive'
    : tone === 'warning' ? 'text-amber-500'
    : tone === 'success' ? 'text-emerald-500'
    : 'text-foreground';
  const probe = debug && probeKey ? registry?.all.find((p) => p.key === probeKey) : undefined;
  return (
    <Card noAnimation>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        {probe && <ProbeBadge probe={probe} />}
      </CardContent>
    </Card>
  );
}

function ProbeBadge({ probe }: { probe: Probe }) {
  const tone =
    probe.status === 'error' ? 'destructive'
    : probe.status === 'empty' ? 'outline'
    : 'secondary';
  return (
    <div className="mt-2 text-[10px] font-mono leading-tight border-t pt-1 space-y-0.5">
      <div className="flex items-center gap-1 flex-wrap">
        <Badge variant={tone as any} className="px-1 py-0 text-[9px]">{probe.type}</Badge>
        {probe.fallback_used && <Badge variant="outline" className="px-1 py-0 text-[9px]">fallback</Badge>}
        <span className="text-muted-foreground truncate">{probe.source}</span>
      </div>
      <div className="text-muted-foreground">
        rows={probe.rows} · {probe.latency_ms}ms · cache=miss
        {probe.window && ` · win=${probe.window}`}
      </div>
      {probe.filters && <div className="text-muted-foreground truncate">f: {probe.filters}</div>}
      {probe.error && <div className="text-destructive truncate">err: {probe.error}</div>}
    </div>
  );
}

// ------------------------------------------------------------------
// Main Page
// ------------------------------------------------------------------

export default function ObservabilityPage() {
  const [tab, setTab] = useState<'inbox' | 'outbox' | 'debug'>('inbox');
  const [windowSel, setWindowSel] = useState<Window>('24h');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const registryRef = useRef(new ProbeRegistry());
  const [probesVersion, setProbesVersion] = useState(0);

  // Inbox state
  const [inboundHealthWin, setInboundHealthWin] = useState<InboundHealthRow[]>([]);
  const [inboundHealth1h, setInboundHealth1h] = useState<InboundHealthRow[]>([]);
  const [inboundEvents, setInboundEvents] = useState<InboundEvent[]>([]);
  const [ingestErrors, setIngestErrors] = useState<IngestError[]>([]);
  const [inboundTopErrors, setInboundTopErrors] = useState<{ error_code: string; message: string; count: number; last_seen: string }[]>([]);
  const [inboundStuck, setInboundStuck] = useState<number>(0);
  const [inboundShadow, setInboundShadow] = useState<number>(0);
  const [inboundSigFailures, setInboundSigFailures] = useState<number>(0);
  const [inboundLatencies, setInboundLatencies] = useState<number[]>([]);
  const [inboundProcessedCount, setInboundProcessedCount] = useState<number>(0);

  // Shadow / parity / timeline / quick filter
  type QuickFilter = 'all' | 'ingest_only' | 'errors' | 'duplicates' | 'sig_invalid';
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [parityRows, setParityRows] = useState<
    { integration_slug: string; legacy: number; shadow: number; diff_abs: number; diff_pct: number | null; status: 'ok' | 'warning' | 'critical' | 'na'; legacy_source: string }[]
  >([]);
  const [timelineBuckets, setTimelineBuckets] = useState<
    { ts: number; ingest: number; sig_fail: number; duplicates: number; ingest_err: number; retries: number; dlq: number; latencies: number[] }[]
  >([]);
  const [duplicatesCount, setDuplicatesCount] = useState<number>(0);
  const [shadowAttempts, setShadowAttempts] = useState<number>(0);
  const [shadowFailures, setShadowFailures] = useState<number>(0);

  // Outbox state
  const [outboxHealth, setOutboxHealth] = useState<OutboxHealth | null>(null);
  const [outboxHealthErr, setOutboxHealthErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<IntegrationJob[]>([]);
  const [eventsCount1h, setEventsCount1h] = useState<number>(0);
  const [eventsCount24h, setEventsCount24h] = useState<number>(0);
  const [jobsCount1h, setJobsCount1h] = useState<number>(0);
  const [jobsCount24h, setJobsCount24h] = useState<number>(0);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [dlqByIntegration, setDlqByIntegration] = useState<
    { integration_slug: string; target_action: string; count: number; last_error: string | null; last_error_at: string | null }[]
  >([]);
  const [outboxLatencies, setOutboxLatencies] = useState<number[]>([]);
  const [topErrors, setTopErrors] = useState<{ message: string; count: number; last_seen: string; sample_integration_slug: string }[]>([]);

  // Drill-down
  const [drillRow, setDrillRow] = useState<any>(null);
  const [drillTitle, setDrillTitle] = useState<string>('');
  const [drillLoading, setDrillLoading] = useState(false);

  const openInboundDrill = useCallback(async (e: InboundEvent) => {
    setDrillTitle('Inbound event');
    setDrillRow(e);
    setDrillLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('integration_inbound_events')
        .select('*')
        .eq('id', e.id)
        .maybeSingle();
      if (data) setDrillRow(data);
    } finally {
      setDrillLoading(false);
    }
  }, []);
  const openJobDrill = useCallback(async (j: IntegrationJob) => {
    setDrillTitle('Outbox job');
    setDrillRow(j);
    setDrillLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('integration_jobs')
        .select('*')
        .eq('id', j.id)
        .maybeSingle();
      if (data) setDrillRow(data);
    } finally {
      setDrillLoading(false);
    }
  }, []);

  const sinceISO = useMemo(() => new Date(Date.now() - WINDOW_TO_MS[windowSel]).toISOString(), [windowSel, lastUpdated]);
  const since1hISO = useMemo(() => new Date(Date.now() - 3600_000).toISOString(), [lastUpdated]);
  const since24hISO = useMemo(() => new Date(Date.now() - 86_400_000).toISOString(), [lastUpdated]);

  // ----------------------------------------------------------------
  // Fetch INBOX
  // ----------------------------------------------------------------
  const fetchInbox = useCallback(async () => {
    const reg = registryRef.current;
    const errors: string[] = [];

    // Health summary (RPC) for 1h and window
    {
      const r1 = await instrument(reg, {
        key: 'inbound.health.1h', label: 'Inbound health 1h',
        source: 'rpc fn_inbound_health_summary', type: 'rpc+fallback', window: '1 hour',
      }, () => (supabase as any).rpc('fn_inbound_health_summary', { _window: '1 hour' }));
      if (r1.error || !r1.data) {
        // Fallback aggregate
        const fb = await instrument(reg, {
          key: 'inbound.health.1h.fb', label: 'Inbound health 1h (fallback)',
          source: 'integration_inbound_events', type: 'table', filters: `received_at>=${since1hISO}`,
          fallback_used: true,
        }, () => (supabase as any).from('integration_inbound_events')
          .select('integration_slug, process_status').gte('received_at', since1hISO).limit(5000));
        const agg: Record<string, InboundHealthRow> = {};
        (fb.data as any[] || []).forEach((r) => {
          const k = `${r.integration_slug}::${r.process_status}`;
          agg[k] ||= { integration_slug: r.integration_slug, status: r.process_status, count: 0, avg_latency_sec: null, p95_latency_sec: null };
          agg[k].count += 1;
        });
        setInboundHealth1h(Object.values(agg));
        if (r1.error) errors.push(`inbound_health_1h: ${r1.error.message}`);
      } else {
        setInboundHealth1h(r1.data as any);
      }
    }
    {
      const rw = await instrument(reg, {
        key: 'inbound.health.win', label: `Inbound health ${windowSel}`,
        source: 'rpc fn_inbound_health_summary', type: 'rpc', window: WINDOW_TO_INTERVAL[windowSel],
      }, () => (supabase as any).rpc('fn_inbound_health_summary', { _window: WINDOW_TO_INTERVAL[windowSel] }));
      if (rw.error) errors.push(`inbound_health_win: ${rw.error.message}`);
      setInboundHealthWin((rw.data as any) || []);
    }

    // Recent events list
    {
      const filters: string[] = [`received_at>=${sinceISO}`];
      let q = (supabase as any).from('integration_inbound_events')
        .select('id, received_at, integration_slug, source_event, process_status, shadow_mode, signature_valid, retry_count, replay_count, trace_id, external_id, organization_id, process_error, processed_at, expires_at')
        .gte('received_at', sinceISO).order('received_at', { ascending: false }).limit(100);
      if (providerFilter !== 'all') { q = q.eq('integration_slug', providerFilter); filters.push(`slug=${providerFilter}`); }
      if (statusFilter !== 'all') { q = q.eq('process_status', statusFilter); filters.push(`status=${statusFilter}`); }
      if (orgFilter) { q = q.eq('organization_id', orgFilter); filters.push(`org=${orgFilter.slice(0, 8)}`); }
      if (quickFilter === 'ingest_only') { q = q.eq('shadow_mode', true); filters.push('only=ingest_only'); }
      if (quickFilter === 'sig_invalid') { q = q.eq('signature_valid', false); filters.push('only=sig_invalid'); }
      if (quickFilter === 'errors') { q = q.in('process_status', ['dead_letter', 'expired', 'retry']); filters.push('only=errors'); }
      if (quickFilter === 'duplicates') { q = q.eq('process_status', 'duplicate_ignored'); filters.push('only=duplicates'); }
      if (search) {
        const s = search.trim();
        q = q.or(`trace_id.eq.${s},external_id.eq.${s}`);
        filters.push(`search=${s.slice(0, 12)}`);
      }
      const r = await instrument(reg, {
        key: 'inbound.events', label: 'Eventos recentes',
        source: 'integration_inbound_events', type: 'table', window: windowSel, filters: filters.join(' & '),
      }, () => q);
      if (r.error) errors.push(`events: ${r.error.message}`);
      const evs = (r.data as any[]) || [];
      setInboundEvents(evs);

      // Latencies + processed counter
      const lats: number[] = [];
      let processed = 0;
      evs.forEach((e: any) => {
        if (e.processed_at && e.received_at) {
          processed += 1;
          const d = (new Date(e.processed_at).getTime() - new Date(e.received_at).getTime()) / 1000;
          if (d >= 0 && d < 86400 * 30) lats.push(d);
        }
      });
      setInboundLatencies(lats);
      setInboundProcessedCount(processed);
    }

    // Stuck > 5min
    {
      const r = await instrument(reg, {
        key: 'inbound.stuck', label: 'Stuck >5m',
        source: 'integration_inbound_events', type: 'table',
        filters: 'process_status=processing & claimed_at<now-5m',
      }, () => (supabase as any).from('integration_inbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('process_status', 'processing')
        .lt('claimed_at', new Date(Date.now() - 5 * 60_000).toISOString()));
      setInboundStuck((r as any).count || 0);
    }

    // Shadow mode (window)
    {
      const r = await instrument(reg, {
        key: 'inbound.shadow', label: 'Shadow mode',
        source: 'integration_inbound_events', type: 'table', window: windowSel,
        filters: 'shadow_mode=true',
      }, () => (supabase as any).from('integration_inbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('shadow_mode', true).gte('received_at', sinceISO));
      setInboundShadow((r as any).count || 0);
    }

    // Signature failures (use window, not hardcoded 24h, for consistency)
    {
      const r = await instrument(reg, {
        key: 'inbound.sig_failures', label: 'Signature failures',
        source: 'integration_inbound_events', type: 'table', window: windowSel,
        filters: 'signature_valid=false',
      }, () => (supabase as any).from('integration_inbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('signature_valid', false).gte('received_at', sinceISO));
      setInboundSigFailures((r as any).count || 0);
    }

    // Ingest errors (window)
    {
      const r = await instrument(reg, {
        key: 'inbound.ingest_errors', label: 'Ingest errors',
        source: 'integration_inbound_ingest_errors', type: 'table', window: windowSel,
      }, () => (supabase as any).from('integration_inbound_ingest_errors')
        .select('id, created_at, integration_slug, error_code, error_message, trace_id, external_id')
        .gte('created_at', sinceISO).order('created_at', { ascending: false }).limit(50));
      if (r.error) errors.push(`ingest_errors: ${r.error.message}`);
      setIngestErrors((r.data as any[]) || []);
    }

    // Top inbound errors via RPC
    {
      const r = await instrument(reg, {
        key: 'inbound.top_errors', label: 'Top ingest errors',
        source: 'rpc fn_inbound_top_errors', type: 'rpc', window: WINDOW_TO_INTERVAL[windowSel],
      }, () => (supabase as any).rpc('fn_inbound_top_errors', { _window: WINDOW_TO_INTERVAL[windowSel], _limit: 10 }));
      setInboundTopErrors((r.data as any[]) || []);
    }

    // Sample for timeline + parity + duplicates + shadow rate (window-scoped)
    {
      const r = await instrument(reg, {
        key: 'inbound.sample', label: 'Amostra (timeline/parity)',
        source: 'integration_inbound_events', type: 'table', window: windowSel,
        filters: 'received_at>=since (cap 5000)',
      }, () => (supabase as any).from('integration_inbound_events')
        .select('received_at, integration_slug, shadow_mode, signature_valid, process_status, processed_at, process_error, retry_count, replay_count')
        .gte('received_at', sinceISO)
        .order('received_at', { ascending: false })
        .limit(5000));
      const rows = (r.data as any[]) || [];

      // ----- Parity por provider: legacy real vs shadow inbox -----
      // Shadow side: inbox_v2 events com shadow_mode=true.
      const byProv: Record<string, { shadow: number }> = {};
      rows.forEach((e) => {
        const slug = e.integration_slug || 'unknown';
        byProv[slug] ||= { shadow: 0 };
        if (e.shadow_mode === true) byProv[slug].shadow += 1;
      });

      // Legacy side: por provider, contar efeito colateral real do fluxo antigo.
      // suvsign → activities `system` com título "Documento assinado%" na janela.
      const legacyBy: Record<string, { count: number; source: string }> = {};
      // suvsign legacy
      {
        const lr = await instrument(reg, {
          key: 'parity.legacy.suvsign', label: 'Legacy suvsign (activities)',
          source: 'activities', type: 'table', window: windowSel,
          filters: "activity_type=system & title ilike 'Documento assinado%'",
        }, () => (supabase as any).from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('activity_type', 'system')
          .ilike('title', 'Documento assinado%')
          .gte('created_at', sinceISO));
        legacyBy['suvsign'] = { count: (lr as any).count || 0, source: 'activities[Documento assinado%]' };
      }
      // Outros providers conhecidos no sample: legacy = N/A (sem fonte definida)
      Object.keys(byProv).forEach((slug) => {
        if (!legacyBy[slug]) legacyBy[slug] = { count: 0, source: 'n/a (sem fonte definida)' };
      });

      const allSlugs = new Set<string>([...Object.keys(byProv), ...Object.keys(legacyBy)]);
      const parity = Array.from(allSlugs).map((slug) => {
        const shadow = byProv[slug]?.shadow ?? 0;
        const legacy = legacyBy[slug]?.count ?? 0;
        const legacy_source = legacyBy[slug]?.source ?? 'n/a';
        const diff_abs = Math.abs(legacy - shadow);
        const diff_pct = legacy > 0 ? (diff_abs / legacy) * 100 : null;
        let status: 'ok' | 'warning' | 'critical' | 'na' = 'na';
        if (legacy_source.startsWith('n/a')) status = 'na';
        else if (diff_pct == null && shadow === 0) status = 'na';
        else if (diff_pct == null) status = 'na';
        else if (diff_pct < 1) status = 'ok';
        else if (diff_pct < 5) status = 'warning';
        else status = 'critical';
        return { integration_slug: slug, legacy, shadow, diff_abs, diff_pct, status, legacy_source };
      }).sort((a, b) => (b.legacy + b.shadow) - (a.legacy + a.shadow));
      setParityRows(parity);

      // Duplicates (process_status convention)
      const dup = rows.filter((e) => e.process_status === 'duplicate_ignored').length;
      setDuplicatesCount(dup);

      // Shadow success rate
      const shAtt = rows.filter((e) => e.shadow_mode === true).length;
      const shFail = rows.filter((e) =>
        e.shadow_mode === true &&
        (['dead_letter', 'expired'].includes(e.process_status) || e.signature_valid === false || !!e.process_error)
      ).length;
      setShadowAttempts(shAtt);
      setShadowFailures(shFail);

      // Timeline buckets
      const winMs = WINDOW_TO_MS[windowSel];
      const bucketMs = windowSel === '1h' ? 60_000 : windowSel === '24h' ? 3_600_000 : 21_600_000; // 1m / 1h / 6h
      const buckets: Record<number, { ts: number; ingest: number; sig_fail: number; duplicates: number; ingest_err: number; retries: number; dlq: number; latencies: number[] }> = {};
      const nowFloor = Math.floor(Date.now() / bucketMs) * bucketMs;
      const start = nowFloor - winMs + bucketMs;
      for (let t = start; t <= nowFloor; t += bucketMs) {
        buckets[t] = { ts: t, ingest: 0, sig_fail: 0, duplicates: 0, ingest_err: 0, retries: 0, dlq: 0, latencies: [] };
      }
      rows.forEach((e) => {
        const t = Math.floor(new Date(e.received_at).getTime() / bucketMs) * bucketMs;
        const b = buckets[t];
        if (!b) return;
        b.ingest += 1;
        if (e.signature_valid === false) b.sig_fail += 1;
        if (e.process_status === 'duplicate_ignored') b.duplicates += 1;
        if ((e.retry_count ?? 0) > 0) b.retries += 1;
        if (e.process_status === 'dead_letter') b.dlq += 1;
        if (e.processed_at) {
          const d = (new Date(e.processed_at).getTime() - new Date(e.received_at).getTime()) / 1000;
          if (d >= 0 && d < 86400) b.latencies.push(d);
        }
      });
      // mix in ingest_errors counts per bucket
      ((await (supabase as any).from('integration_inbound_ingest_errors')
        .select('created_at').gte('created_at', sinceISO).limit(5000)).data as any[] || []
      ).forEach((er) => {
        const t = Math.floor(new Date(er.created_at).getTime() / bucketMs) * bucketMs;
        if (buckets[t]) buckets[t].ingest_err += 1;
      });
      setTimelineBuckets(Object.values(buckets).sort((a, b) => a.ts - b.ts));
    }

    if (errors.length) setError(errors.join(' | '));
  }, [windowSel, providerFilter, statusFilter, orgFilter, search, since1hISO, sinceISO, quickFilter]);

  // ----------------------------------------------------------------
  // Fetch OUTBOX
  // ----------------------------------------------------------------
  const fetchOutbox = useCallback(async () => {
    const reg = registryRef.current;
    const errs: string[] = [];

    // Health summary RPC
    {
      const r = await instrument(reg, {
        key: 'outbox.health', label: 'Outbox health',
        source: 'rpc fn_outbox_health_summary', type: 'rpc',
      }, () => (supabase as any).rpc('fn_outbox_health_summary'));
      if (r.error) { setOutboxHealth(null); setOutboxHealthErr(r.error.message); }
      else { setOutboxHealth(r.data as OutboxHealth); setOutboxHealthErr(null); }
    }

    // Counts
    {
      const r = await instrument(reg, { key: 'outbox.events.1h', label: 'Events 1h', source: 'integration_events', type: 'table', window: '1h' },
        () => (supabase as any).from('integration_events').select('id', { count: 'exact', head: true }).gte('occurred_at', since1hISO));
      setEventsCount1h((r as any).count || 0);
    }
    {
      const r = await instrument(reg, { key: 'outbox.events.24h', label: 'Events 24h', source: 'integration_events', type: 'table', window: '24h' },
        () => (supabase as any).from('integration_events').select('id', { count: 'exact', head: true }).gte('occurred_at', since24hISO));
      setEventsCount24h((r as any).count || 0);
    }
    {
      const r = await instrument(reg, { key: 'outbox.jobs.1h', label: 'Jobs 1h', source: 'integration_jobs', type: 'table', window: '1h' },
        () => (supabase as any).from('integration_jobs').select('id', { count: 'exact', head: true }).gte('created_at', since1hISO));
      setJobsCount1h((r as any).count || 0);
    }
    {
      const r = await instrument(reg, { key: 'outbox.jobs.24h', label: 'Jobs 24h', source: 'integration_jobs', type: 'table', window: '24h' },
        () => (supabase as any).from('integration_jobs').select('id', { count: 'exact', head: true }).gte('created_at', since24hISO));
      setJobsCount24h((r as any).count || 0);
    }

    // Recent jobs
    {
      const filters: string[] = [`created_at>=${sinceISO}`];
      let q = (supabase as any).from('integration_jobs')
        .select('id, created_at, integration_slug, target_action, status, attempts, max_attempts, next_run_at, organization_id, last_error, idempotency_key, started_at, completed_at, event_id')
        .gte('created_at', sinceISO).order('created_at', { ascending: false }).limit(100);
      if (providerFilter !== 'all') { q = q.eq('integration_slug', providerFilter); filters.push(`slug=${providerFilter}`); }
      if (statusFilter !== 'all') { q = q.eq('status', statusFilter); filters.push(`status=${statusFilter}`); }
      if (orgFilter) { q = q.eq('organization_id', orgFilter); filters.push(`org=${orgFilter.slice(0, 8)}`); }
      if (search) { q = q.eq('idempotency_key', search.trim()); filters.push(`idem=${search.slice(0, 12)}`); }
      const r = await instrument(reg, {
        key: 'outbox.jobs', label: 'Jobs recentes',
        source: 'integration_jobs', type: 'table', window: windowSel, filters: filters.join(' & '),
      }, () => q);
      if (r.error) errs.push(`jobs: ${r.error.message}`);
      setJobs((r.data as any[]) || []);
    }

    // Latencies
    {
      const r = await instrument(reg, {
        key: 'outbox.latency.jobs', label: 'Latency (success jobs)',
        source: 'integration_jobs', type: 'table', window: windowSel,
        filters: 'status=success & completed_at not null',
      }, () => (supabase as any).from('integration_jobs')
        .select('event_id, completed_at, created_at')
        .eq('status', 'success').gte('completed_at', sinceISO).not('completed_at', 'is', null).limit(500));
      const succJobs = (r.data as any[]) || [];
      const eventIds = Array.from(new Set(succJobs.map((j: any) => j.event_id).filter(Boolean)));
      let evMap: Record<string, string> = {};
      if (eventIds.length) {
        const r2 = await instrument(reg, {
          key: 'outbox.latency.events', label: 'Latency (event pub)',
          source: 'integration_events', type: 'table',
        }, () => (supabase as any).from('integration_events')
          .select('id, published_at, occurred_at').in('id', eventIds.slice(0, 500)));
        (r2.data as any[] || []).forEach((e: any) => { evMap[e.id] = e.published_at || e.occurred_at; });
      }
      const olats: number[] = [];
      succJobs.forEach((j: any) => {
        const pub = evMap[j.event_id];
        if (pub && j.completed_at) {
          const d = (new Date(j.completed_at).getTime() - new Date(pub).getTime()) / 1000;
          if (d >= 0 && d < 86400) olats.push(d);
        }
      });
      setOutboxLatencies(olats);
    }

    // DLQ by integration (server-side via RPC)
    {
      const r = await instrument(reg, {
        key: 'outbox.dlq_by_integration', label: 'DLQ por integração',
        source: 'rpc fn_outbox_dlq_by_integration', type: 'rpc+fallback',
      }, () => (supabase as any).rpc('fn_outbox_dlq_by_integration'));
      if (r.error || !r.data) {
        // fallback: client-side aggregation on a (capped) sample
        const fb = await instrument(reg, {
          key: 'outbox.dlq_by_integration.fb', label: 'DLQ (fallback)',
          source: 'integration_jobs', type: 'table', filters: 'status=dead_letter limit 1000',
          fallback_used: true,
        }, () => (supabase as any).from('integration_jobs')
          .select('integration_slug, target_action, last_error, last_error_at')
          .eq('status', 'dead_letter').limit(1000));
        const agg: Record<string, any> = {};
        (fb.data as any[] || []).forEach((r2: any) => {
          const k = `${r2.integration_slug}::${r2.target_action}`;
          agg[k] ||= { integration_slug: r2.integration_slug, target_action: r2.target_action, count: 0, last_error: null, last_error_at: null };
          agg[k].count += 1;
          if (!agg[k].last_error_at || (r2.last_error_at && r2.last_error_at > agg[k].last_error_at)) {
            agg[k].last_error = r2.last_error; agg[k].last_error_at = r2.last_error_at;
          }
        });
        setDlqByIntegration(Object.values(agg).sort((a: any, b: any) => b.count - a.count));
      } else {
        setDlqByIntegration((r.data as any[]) || []);
      }
    }

    // Top errors via RPC (window-aware)
    {
      const r = await instrument(reg, {
        key: 'outbox.top_errors', label: 'Top errors',
        source: 'rpc fn_outbox_top_errors', type: 'rpc', window: WINDOW_TO_INTERVAL[windowSel],
      }, () => (supabase as any).rpc('fn_outbox_top_errors', { _window: WINDOW_TO_INTERVAL[windowSel], _limit: 10 }));
      setTopErrors((r.data as any[]) || []);
    }

    // Subscriptions
    {
      const r = await instrument(reg, {
        key: 'outbox.subscriptions', label: 'Subscriptions',
        source: 'integration_subscriptions', type: 'table',
      }, () => (supabase as any).from('integration_subscriptions')
        .select('id, integration_slug, event_type, target_action, is_active, paused_until')
        .order('integration_slug', { ascending: true }).limit(200));
      if (r.error) errs.push(`subscriptions: ${r.error.message}`);
      setSubscriptions((r.data as any[]) || []);
    }

    if (errs.length) setError((prev) => [prev, ...errs].filter(Boolean).join(' | '));
  }, [providerFilter, statusFilter, orgFilter, search, sinceISO, since1hISO, since24hISO, windowSel]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    registryRef.current.clear();
    try {
      await Promise.all([fetchInbox(), fetchOutbox()]);
      setLastUpdated(new Date());
      setProbesVersion((v) => v + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchInbox, fetchOutbox]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSel, providerFilter, statusFilter, orgFilter, quickFilter]);

  // Derived
  const inboundByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    inboundHealthWin.forEach((r) => { m[r.status] = (m[r.status] || 0) + Number(r.count); });
    return m;
  }, [inboundHealthWin]);

  const inboundByProvider = useMemo(() => {
    const m: Record<string, number> = {};
    inboundHealthWin.forEach((r) => { m[r.integration_slug] = (m[r.integration_slug] || 0) + Number(r.count); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [inboundHealthWin]);

  const inboundTotal1h = useMemo(() => inboundHealth1h.reduce((s, r) => s + Number(r.count || 0), 0), [inboundHealth1h]);
  const inboundTotalWin = useMemo(() => inboundHealthWin.reduce((s, r) => s + Number(r.count || 0), 0), [inboundHealthWin]);

  const allProviders = useMemo(() => {
    const set = new Set<string>();
    inboundHealthWin.forEach((r) => set.add(r.integration_slug));
    jobs.forEach((j) => set.add(j.integration_slug));
    subscriptions.forEach((s) => set.add(s.integration_slug));
    return Array.from(set).filter(Boolean).sort();
  }, [inboundHealthWin, jobs, subscriptions]);

  const allStatuses = useMemo(() => {
    if (tab === 'inbox') return ['received', 'processing', 'retry', 'processed', 'dead_letter', 'expired', 'archived'];
    return ['pending', 'running', 'success', 'failed', 'retry', 'dead_letter'];
  }, [tab]);

  const healthLevel: 'healthy' | 'warning' | 'critical' = useMemo(() => {
    const stuckIn = inboundStuck;
    const stuckOut = outboxHealth?.running_stuck_5m ?? 0;
    const dlqOut = outboxHealth?.dead_letter ?? 0;
    const ingest = ingestErrors.length;
    const sig = inboundSigFailures;
    if (stuckIn > 10 || stuckOut > 10 || outboxHealthErr) return 'critical';
    if (stuckIn > 0 || stuckOut > 0 || ingest > 0 || sig > 0 || dlqOut > 0) return 'warning';
    return 'healthy';
  }, [inboundStuck, outboxHealth, outboxHealthErr, ingestErrors.length, inboundSigFailures]);

  const allProbes = registryRef.current.all;
  void probesVersion;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Observabilidade</h1>
            <HealthPill level={healthLevel} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Bug className="h-3.5 w-3.5 text-muted-foreground" />
              <label className="text-xs text-muted-foreground">Debug</label>
              <Switch checked={debug} onCheckedChange={setDebug} />
            </div>
            <div className="text-xs text-muted-foreground">
              Última atualização: {lastUpdated ? fmtRelative(lastUpdated.toISOString()) : '—'}
            </div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Read-only banner */}
        <div className="text-xs text-muted-foreground border border-dashed rounded px-3 py-2">
          Painel <span className="font-medium">read-only</span>. Nenhum botão modifica dados.
          Nenhuma feature flag, cron ou webhook é alterado.
        </div>

        {/* Filters */}
        <Card noAnimation>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <Field label="Janela">
              <Select value={windowSel} onValueChange={(v) => setWindowSel(v as Window)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1h</SelectItem>
                  <SelectItem value="24h">24h</SelectItem>
                  <SelectItem value="7d">7d</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Provider">
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {allProviders.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {allStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="organization_id">
              <Input value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} placeholder="uuid" className="w-72" />
            </Field>
            <Field label="Buscar trace_id / external_id / idempotency_key">
              <div className="flex gap-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && refresh()}
                  placeholder="cole aqui e Enter" className="w-80" />
                <Button size="sm" variant="outline" onClick={refresh}>Buscar</Button>
              </div>
            </Field>
          </CardContent>
        </Card>

        {error && (
          <div className="text-xs text-destructive border border-destructive/40 rounded px-3 py-2">{error}</div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="outbox">Outbox</TabsTrigger>
            {debug && <TabsTrigger value="debug">Debug ({allProbes.length})</TabsTrigger>}
          </TabsList>

          {/* ============================== INBOX ============================== */}
          <TabsContent value="inbox" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Eventos 1h" value={inboundTotal1h} probeKey="inbound.health.1h" registry={registryRef.current} debug={debug} />
              <StatCard label={`Eventos ${windowSel}`} value={inboundTotalWin} probeKey="inbound.health.win" registry={registryRef.current} debug={debug} />
              <StatCard label="Stuck processing >5m" value={inboundStuck}
                tone={inboundStuck > 10 ? 'critical' : inboundStuck > 0 ? 'warning' : 'success'}
                probeKey="inbound.stuck" registry={registryRef.current} debug={debug} />
              <StatCard label="Ingest-only (shadow_mode=true)" value={inboundShadow} hint={`janela ${windowSel}`}
                probeKey="inbound.shadow" registry={registryRef.current} debug={debug} />
              <StatCard label={`Signature failures (${windowSel})`} value={inboundSigFailures}
                tone={inboundSigFailures > 0 ? 'warning' : 'success'}
                probeKey="inbound.sig_failures" registry={registryRef.current} debug={debug} />
              <StatCard label={`Ingest errors (${windowSel})`} value={ingestErrors.length}
                tone={ingestErrors.length > 0 ? 'warning' : 'success'}
                probeKey="inbound.ingest_errors" registry={registryRef.current} debug={debug} />
              <StatCard
                label="p50 latency"
                value={inboundProcessedCount === 0 ? <span className="text-muted-foreground text-base">dispatcher inativo</span> : fmtLatency(p50(inboundLatencies))}
                hint={inboundProcessedCount === 0 ? 'nenhum evento processado_at na janela' : `n=${inboundProcessedCount}`}
              />
              <StatCard
                label="p95 latency"
                value={inboundProcessedCount === 0 ? <span className="text-muted-foreground text-base">dispatcher inativo</span> : fmtLatency(p95(inboundLatencies))}
                hint={inboundProcessedCount === 0 ? 'nenhum evento processado_at na janela' : `n=${inboundProcessedCount}`}
              />
              <StatCard
                label={`Duplicates ignored (${windowSel})`}
                value={duplicatesCount}
                hint="process_status=duplicate_ignored"
                tone={duplicatesCount > 0 ? 'warning' : 'default'}
                probeKey="inbound.sample" registry={registryRef.current} debug={debug}
              />
              <StatCard
                label="Shadow insert success rate"
                value={
                  shadowAttempts === 0
                    ? '—'
                    : `${(((shadowAttempts - shadowFailures) / shadowAttempts) * 100).toFixed(2)}%`
                }
                hint={shadowAttempts === 0 ? 'sem inserts shadow ainda' : `${shadowAttempts - shadowFailures}/${shadowAttempts} ok`}
                tone={
                  shadowAttempts === 0 ? 'default'
                  : shadowFailures === 0 ? 'success'
                  : shadowFailures / shadowAttempts < 0.01 ? 'success'
                  : shadowFailures / shadowAttempts < 0.05 ? 'warning' : 'critical'
                }
              />
            </div>

            {/* Quick filters */}
            <Card noAnimation>
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Quick filter:</span>
                {(['all', 'ingest_only', 'errors', 'duplicates', 'sig_invalid'] as QuickFilter[]).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={quickFilter === f ? 'default' : 'outline'}
                    onClick={() => setQuickFilter(f)}
                    className="h-7 text-xs"
                  >
                    {f === 'all' ? 'All' : `Only ${f.replace('_', ' ')}`}
                  </Button>
                ))}
                {quickFilter !== 'all' && (
                  <span className="text-[10px] text-muted-foreground ml-2">
                    aplicado a “Eventos recentes” • janela {windowSel}
                  </span>
                )}
              </CardContent>
            </Card>

            {/* Shadow parity */}
            <Card noAnimation>
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm">Shadow parity ({windowSel})</CardTitle>
                {debug && <ProbeMiniBadge probeKey="inbound.sample" registry={registryRef.current} />}
              </CardHeader>
              <CardContent>
                {parityRows.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem dados na janela.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Legacy</TableHead>
                        <TableHead className="text-right">Inbox v2 (shadow)</TableHead>
                        <TableHead className="text-right">Diff abs</TableHead>
                        <TableHead className="text-right">Diff %</TableHead>
                        <TableHead>Legacy source</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parityRows.map((r) => (
                        <TableRow key={r.integration_slug}>
                          <TableCell className="text-xs">{r.integration_slug}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.legacy}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.shadow}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.diff_abs}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.diff_pct == null ? '—' : `${r.diff_pct.toFixed(2)}%`}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{r.legacy_source}</TableCell>
                          <TableCell>
                            {r.status === 'ok' && <Badge className="bg-emerald-500 hover:bg-emerald-500">OK</Badge>}
                            {r.status === 'warning' && <Badge className="bg-amber-500 hover:bg-amber-500">Warning</Badge>}
                            {r.status === 'critical' && <Badge variant="destructive">Critical</Badge>}
                            {r.status === 'na' && <Badge variant="outline">n/a</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="text-[10px] text-muted-foreground mt-2">
                  Legacy = efeito colateral real do fluxo antigo (ex.: suvsign → activities "Documento assinado%"). Shadow = inserts em integration_inbound_events com shadow_mode=true. OK &lt;1% · Warning &lt;5% · Critical ≥5%.
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card noAnimation>
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm">
                  Timeline ({windowSel === '1h' ? 'por minuto' : windowSel === '24h' ? 'por hora' : 'por 6h'})
                </CardTitle>
                {debug && <ProbeMiniBadge probeKey="inbound.sample" registry={registryRef.current} />}
              </CardHeader>
              <CardContent>
                {timelineBuckets.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem dados na janela.</div>
                ) : (
                  <TimelineSparkChart buckets={timelineBuckets} />
                )}
              </CardContent>
            </Card>


            <div className="grid md:grid-cols-2 gap-4">
              <Card noAnimation>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Por status (janela {windowSel})</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {Object.entries(inboundByStatus).length === 0
                    ? <div className="text-muted-foreground text-xs">Sem dados na janela.</div>
                    : Object.entries(inboundByStatus).map(([s, c]) => (
                      <div key={s} className="flex justify-between">
                        <Badge variant={statusVariant(s)}>{s}</Badge>
                        <span className="font-mono">{c}</span>
                      </div>
                    ))}
                </CardContent>
              </Card>
              <Card noAnimation>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Por provider (janela {windowSel})</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {inboundByProvider.length === 0
                    ? <div className="text-muted-foreground text-xs">Sem dados na janela.</div>
                    : inboundByProvider.map(([p, c]) => (
                      <div key={p} className="flex justify-between">
                        <span>{p}</span><span className="font-mono">{c}</span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>

            {/* Top inbound errors */}
            <Card noAnimation>
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm">Top ingest errors ({windowSel})</CardTitle>
                {debug && <ProbeMiniBadge probeKey="inbound.top_errors" registry={registryRef.current} />}
              </CardHeader>
              <CardContent>
                {inboundTopErrors.length === 0
                  ? <div className="text-xs text-muted-foreground">Sem ingest errors na janela.</div>
                  : (
                    <div className="space-y-1 text-xs">
                      {inboundTopErrors.map((e, i) => (
                        <div key={i} className="flex justify-between gap-2">
                          <span className="truncate"><Badge variant="outline" className="mr-1">{e.error_code}</Badge>{e.message}</span>
                          <span className="font-mono">{e.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </CardContent>
            </Card>

            {/* Ingest errors table */}
            <Card noAnimation>
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm">Ingest errors recentes ({windowSel})</CardTitle>
                {debug && <ProbeMiniBadge probeKey="inbound.ingest_errors" registry={registryRef.current} />}
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-24" /> : ingestErrors.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem ingest errors na janela.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead><TableHead>Provider</TableHead>
                        <TableHead>Code</TableHead><TableHead>Mensagem</TableHead>
                        <TableHead>trace_id</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingestErrors.map((r) => (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => { setDrillRow(r); setDrillTitle('Ingest error'); }}>
                          <TableCell className="whitespace-nowrap text-xs">{fmtRelative(r.created_at)}</TableCell>
                          <TableCell>{r.integration_slug}</TableCell>
                          <TableCell><Badge variant="outline">{r.error_code || '—'}</Badge></TableCell>
                          <TableCell className="max-w-md truncate text-xs">{r.error_message}</TableCell>
                          <TableCell className="font-mono text-xs">{r.trace_id?.slice(0, 8) || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Events */}
            <Card noAnimation>
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm">Eventos recentes ({inboundEvents.length}) — janela {windowSel}</CardTitle>
                {debug && <ProbeMiniBadge probeKey="inbound.events" registry={registryRef.current} />}
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-40" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead><TableHead>Provider</TableHead><TableHead>Event</TableHead>
                        <TableHead>Status</TableHead><TableHead>Flags</TableHead><TableHead>Sig</TableHead>
                        <TableHead>Retry</TableHead><TableHead>trace</TableHead><TableHead>external</TableHead>
                        <TableHead>org</TableHead><TableHead>error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inboundEvents.map((e) => (
                        <TableRow key={e.id} className="cursor-pointer" onClick={() => openInboundDrill(e)}>
                          <TableCell className="whitespace-nowrap text-xs">{fmtRelative(e.received_at)}</TableCell>
                          <TableCell className="text-xs">{e.integration_slug}</TableCell>
                          <TableCell className="text-xs">{e.source_event || '—'}</TableCell>
                          <TableCell><Badge variant={statusVariant(e.process_status)}>{e.process_status}</Badge></TableCell>
                          <TableCell><EventFlagBadges e={e} /></TableCell>
                          <TableCell className="text-xs">{e.signature_valid === false ? '✗' : e.signature_valid ? '✓' : '—'}</TableCell>
                          <TableCell className="text-xs">{e.retry_count ?? 0}</TableCell>
                          <TableCell className="font-mono text-xs">{e.trace_id?.slice(0, 8) || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{e.external_id?.slice(0, 12) || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{e.organization_id ? e.organization_id.slice(0, 8) : <span className="text-amber-600">unknown</span>}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-destructive">{e.process_error || ''}</TableCell>
                        </TableRow>
                      ))}
                      {inboundEvents.length === 0 && (
                        <TableRow><TableCell colSpan={11} className="text-center text-xs text-muted-foreground">Sem eventos na janela.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================== OUTBOX ============================== */}
          <TabsContent value="outbox" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Events 1h" value={eventsCount1h} probeKey="outbox.events.1h" registry={registryRef.current} debug={debug} />
              <StatCard label="Events 24h" value={eventsCount24h} probeKey="outbox.events.24h" registry={registryRef.current} debug={debug} />
              <StatCard label="Jobs 1h" value={jobsCount1h} probeKey="outbox.jobs.1h" registry={registryRef.current} debug={debug} />
              <StatCard label="Jobs 24h" value={jobsCount24h} probeKey="outbox.jobs.24h" registry={registryRef.current} debug={debug} />
              <StatCard label="Pending" value={outboxHealth?.pending ?? '—'} probeKey="outbox.health" registry={registryRef.current} debug={debug} />
              <StatCard label="Running" value={outboxHealth?.running ?? '—'}
                hint={`stuck>5m: ${outboxHealth?.running_stuck_5m ?? 0}`}
                tone={(outboxHealth?.running_stuck_5m ?? 0) > 10 ? 'critical' : (outboxHealth?.running_stuck_5m ?? 0) > 0 ? 'warning' : 'default'} />
              <StatCard label="Dead letter (total)" value={outboxHealth?.dead_letter ?? '—'}
                tone={(outboxHealth?.dead_letter ?? 0) > 0 ? 'warning' : 'success'} />
              <StatCard label="Success 24h" value={outboxHealth?.success_24h ?? '—'}
                hint={`failed: ${outboxHealth?.failed_24h ?? 0}`} tone="success" />
              <StatCard label="p50 latency"
                value={outboxLatencies.length === 0 ? <span className="text-muted-foreground text-base">dispatcher inativo</span> : fmtLatency(p50(outboxLatencies))}
                hint={outboxLatencies.length === 0 ? 'sem jobs success com event publish_at na janela' : `n=${outboxLatencies.length}`} />
              <StatCard label="p95 latency"
                value={outboxLatencies.length === 0 ? <span className="text-muted-foreground text-base">dispatcher inativo</span> : fmtLatency(p95(outboxLatencies))}
                hint={outboxLatencies.length === 0 ? 'sem jobs success com event publish_at na janela' : `n=${outboxLatencies.length}`} />
              <StatCard label="Subscriptions"
                value={`${outboxHealth?.subscriptions_active ?? 0} / ${(outboxHealth?.subscriptions_active ?? 0) + (outboxHealth?.subscriptions_paused ?? 0)}`}
                hint="ativas / total" />
              <StatCard label="Worker last run"
                value={outboxHealth?.worker_last_run_at ? fmtRelative(outboxHealth.worker_last_run_at) : '—'}
                hint={`reaper: ${outboxHealth?.reaper_last_run_at ? fmtRelative(outboxHealth.reaper_last_run_at) : '—'}`}
                tone={outboxHealth?.worker_last_run_at && (Date.now() - new Date(outboxHealth.worker_last_run_at).getTime()) > 3600_000 ? 'warning' : 'default'}
              />
            </div>

            {outboxHealthErr && (
              <div className="text-xs text-destructive border border-destructive/40 rounded px-3 py-2">
                fn_outbox_health_summary falhou: {outboxHealthErr}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <Card noAnimation>
                <CardHeader className="pb-2 flex flex-row justify-between items-center">
                  <CardTitle className="text-sm">DLQ por integração (total)</CardTitle>
                  {debug && <ProbeMiniBadge probeKey="outbox.dlq_by_integration" registry={registryRef.current} />}
                </CardHeader>
                <CardContent>
                  {dlqByIntegration.length === 0 ? <div className="text-xs text-muted-foreground">Sem itens em DLQ.</div> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provider</TableHead><TableHead>Action</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead>Último</TableHead><TableHead>Último erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dlqByIntegration.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{r.integration_slug}</TableCell>
                            <TableCell className="text-xs">{r.target_action}</TableCell>
                            <TableCell className="text-right font-mono">{r.count}</TableCell>
                            <TableCell className="text-xs">{r.last_error_at ? fmtRelative(r.last_error_at) : '—'}</TableCell>
                            <TableCell className="max-w-xs truncate text-xs">{r.last_error || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card noAnimation>
                <CardHeader className="pb-2 flex flex-row justify-between items-center">
                  <CardTitle className="text-sm">Top errors ({windowSel})</CardTitle>
                  {debug && <ProbeMiniBadge probeKey="outbox.top_errors" registry={registryRef.current} />}
                </CardHeader>
                <CardContent>
                  {topErrors.length === 0 ? <div className="text-xs text-muted-foreground">Sem erros na janela.</div> : (
                    <div className="space-y-1 text-xs">
                      {topErrors.map((e, i) => (
                        <div key={i} className="flex justify-between gap-2">
                          <span className="truncate max-w-md">
                            <Badge variant="outline" className="mr-1">{e.sample_integration_slug}</Badge>
                            {e.message}
                          </span>
                          <span className="font-mono">{e.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card noAnimation>
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm">Jobs recentes ({jobs.length}) — janela {windowSel}</CardTitle>
                {debug && <ProbeMiniBadge probeKey="outbox.jobs" registry={registryRef.current} />}
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-40" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead><TableHead>Provider</TableHead><TableHead>Action</TableHead>
                        <TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Next run</TableHead>
                        <TableHead>org</TableHead><TableHead>idem_key</TableHead><TableHead>error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j) => (
                        <TableRow key={j.id} className="cursor-pointer" onClick={() => openJobDrill(j)}>
                          <TableCell className="whitespace-nowrap text-xs">{fmtRelative(j.created_at)}</TableCell>
                          <TableCell className="text-xs">{j.integration_slug}</TableCell>
                          <TableCell className="text-xs">{j.target_action}</TableCell>
                          <TableCell><Badge variant={statusVariant(j.status)}>{j.status}</Badge></TableCell>
                          <TableCell className="text-xs">{j.attempts ?? 0}/{j.max_attempts ?? '—'}</TableCell>
                          <TableCell className="text-xs">{j.next_run_at ? fmtRelative(j.next_run_at) : '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{j.organization_id ? j.organization_id.slice(0, 8) : <span className="text-amber-600">unknown</span>}</TableCell>
                          <TableCell className="font-mono text-xs">{j.idempotency_key?.slice(0, 12) || '—'}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-destructive">{j.last_error || ''}</TableCell>
                        </TableRow>
                      ))}
                      {jobs.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground">Sem jobs na janela {windowSel}.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card noAnimation>
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm">Subscriptions ({subscriptions.length})</CardTitle>
                {debug && <ProbeMiniBadge probeKey="outbox.subscriptions" registry={registryRef.current} />}
              </CardHeader>
              <CardContent>
                {subscriptions.length === 0 ? <div className="text-xs text-muted-foreground">Nenhuma subscription.</div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead><TableHead>Event type</TableHead>
                        <TableHead>Action</TableHead><TableHead>Ativa</TableHead><TableHead>Pausada até</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscriptions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs">{s.integration_slug}</TableCell>
                          <TableCell className="text-xs">{s.event_type}</TableCell>
                          <TableCell className="text-xs">{s.target_action}</TableCell>
                          <TableCell>{s.is_active ? <Badge>ativa</Badge> : <Badge variant="outline">inativa</Badge>}</TableCell>
                          <TableCell className="text-xs">{s.paused_until ? fmtTime(s.paused_until) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================== DEBUG ============================== */}
          {debug && (
            <TabsContent value="debug" className="space-y-4 mt-4">
              <Card noAnimation>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Probes ({allProbes.length})</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead><TableHead>Label</TableHead><TableHead>Source</TableHead>
                        <TableHead>Type</TableHead><TableHead>Window</TableHead><TableHead>Filters</TableHead>
                        <TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Latency</TableHead>
                        <TableHead>Status</TableHead><TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allProbes.map((p) => (
                        <TableRow key={p.key}>
                          <TableCell className="font-mono text-[11px]">{p.key}</TableCell>
                          <TableCell className="text-xs">{p.label}</TableCell>
                          <TableCell className="text-xs">{p.source}</TableCell>
                          <TableCell className="text-xs">{p.type}</TableCell>
                          <TableCell className="text-xs">{p.window || '—'}</TableCell>
                          <TableCell className="text-xs max-w-xs truncate">{p.filters || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{p.rows}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{p.latency_ms}ms</TableCell>
                          <TableCell>
                            <Badge variant={p.status === 'error' ? 'destructive' : p.status === 'empty' ? 'outline' : 'secondary'}>
                              {p.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-destructive">{p.error || ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Drill-down modal */}
      <Dialog open={!!drillRow} onOpenChange={(o) => !o && setDrillRow(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {drillTitle}
              {drillLoading && <span className="text-[10px] text-muted-foreground font-mono">carregando payload…</span>}
            </DialogTitle>
          </DialogHeader>
          {drillRow && <DrillDownView row={drillRow} />}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ProbeMiniBadge({ probeKey, registry }: { probeKey: string; registry: ProbeRegistry }) {
  const p = registry.all.find((x) => x.key === probeKey);
  if (!p) return null;
  return (
    <span className="text-[10px] font-mono text-muted-foreground">
      [{p.type}] {p.source} · rows={p.rows} · {p.latency_ms}ms
      {p.error && <span className="text-destructive"> · err</span>}
    </span>
  );
}

function HealthPill({ level }: { level: 'healthy' | 'warning' | 'critical' }) {
  if (level === 'healthy') {
    return <Badge className="bg-emerald-500 hover:bg-emerald-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Healthy</Badge>;
  }
  if (level === 'warning') {
    return <Badge className="bg-amber-500 hover:bg-amber-500"><AlertTriangle className="h-3 w-3 mr-1" /> Warning</Badge>;
  }
  return <Badge variant="destructive"><AlertOctagon className="h-3 w-3 mr-1" /> Critical</Badge>;
}

function EventFlagBadges({ e }: { e: any }) {
  const flags: { label: string; cls: string }[] = [];
  if (e.shadow_mode === true) flags.push({ label: 'ingest_only', cls: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30' });
  if (e.process_status === 'duplicate_ignored') flags.push({ label: 'duplicate', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' });
  if (e.signature_valid === false) flags.push({ label: 'sig_invalid', cls: 'bg-destructive/15 text-destructive border-destructive/30' });
  if ((e.replay_count ?? 0) > 0) flags.push({ label: 'replayed', cls: 'bg-sky-500/15 text-sky-600 border-sky-500/30' });
  if (e.process_status === 'expired' || (e.expires_at && new Date(e.expires_at).getTime() < Date.now())) {
    flags.push({ label: 'expired', cls: 'bg-muted text-muted-foreground border-border' });
  }
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f.label} className={`text-[9px] px-1.5 py-0.5 border rounded ${f.cls}`}>{f.label}</span>
      ))}
    </div>
  );
}

function TimelineSparkChart({
  buckets,
}: {
  buckets: { ts: number; ingest: number; sig_fail: number; duplicates: number; ingest_err: number; retries: number; dlq: number; latencies: number[] }[];
}) {
  const max = Math.max(1, ...buckets.map((b) =>
    Math.max(b.ingest, b.sig_fail, b.duplicates, b.ingest_err, b.retries, b.dlq)
  ));
  const W = 800;
  const H = 120;
  const step = buckets.length > 1 ? W / (buckets.length - 1) : 0;
  const path = (key: keyof typeof buckets[number]) =>
    buckets.map((b, i) => {
      const v = Number(b[key] as number) || 0;
      const x = i * step;
      const y = H - (v / max) * (H - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

  const fmtBucketTs = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };
  const allLats = buckets.flatMap((b) => b.latencies);
  const p50v = p50(allLats); const p95v = p95(allLats);

  const legend = [
    { k: 'ingest', label: 'ingest volume', color: 'hsl(217 91% 60%)' },
    { k: 'sig_fail', label: 'sig failures', color: 'hsl(0 84% 60%)' },
    { k: 'duplicates', label: 'duplicates', color: 'hsl(38 92% 50%)' },
    { k: 'ingest_err', label: 'ingest errors', color: 'hsl(280 70% 55%)' },
    { k: 'retries', label: 'retries', color: 'hsl(199 89% 48%)' },
    { k: 'dlq', label: 'DLQ', color: 'hsl(340 82% 52%)' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[10px]">
        {legend.map((l) => (
          <div key={l.k} className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ background: l.color }} />
            <span className="text-muted-foreground">{l.label}</span>
          </div>
        ))}
        <div className="ml-auto text-muted-foreground font-mono">
          p50={fmtLatency(p50v)} · p95={fmtLatency(p95v)} · max y={max}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 border rounded bg-muted/30">
        {legend.map((l) => (
          <path key={l.k} d={path(l.k as any)} fill="none" stroke={l.color} strokeWidth={1.5} />
        ))}
      </svg>
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
        <span>{buckets[0] ? fmtBucketTs(buckets[0].ts) : ''}</span>
        <span>{buckets[Math.floor(buckets.length / 2)] ? fmtBucketTs(buckets[Math.floor(buckets.length / 2)].ts) : ''}</span>
        <span>{buckets[buckets.length - 1] ? fmtBucketTs(buckets[buckets.length - 1].ts) : ''}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Drill-down structured view
// ------------------------------------------------------------------
function DrillDownView({ row }: { row: any }) {
  const meta: [string, any][] = [
    ['id', row.id],
    ['trace_id', row.trace_id],
    ['organization_id', row.organization_id ?? <span className="text-amber-600">unknown</span>],
    ['integration_slug', row.integration_slug],
    ['source_event / target_action', row.source_event ?? row.target_action],
    ['external_id', row.external_id],
    ['idempotency_key', row.idempotency_key],
    ['handler_key', row.handler_key],
    ['process_status / status', row.process_status ?? row.status],
    ['signature_valid', String(row.signature_valid ?? '—')],
    ['shadow_mode (=ingest_only)', String(row.shadow_mode ?? '—')],
    ['retry_count / attempts', row.retry_count ?? row.attempts ?? 0],
    ['replay_count', row.replay_count ?? 0],
    ['max_attempts', row.max_attempts],
    ['received_at / created_at', row.received_at ?? row.created_at],
    ['claimed_at / started_at', row.claimed_at ?? row.started_at],
    ['processed_at / completed_at', row.processed_at ?? row.completed_at],
    ['next_run_at', row.next_run_at],
    ['expires_at', row.expires_at],
    ['process_error / last_error', row.process_error ?? row.last_error],
  ];
  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
        {meta.map(([k, v]) => (
          <div key={String(k)} className="flex gap-2 border-b border-border/40 py-1">
            <span className="text-muted-foreground min-w-[180px]">{k}</span>
            <span className="break-all">{v == null || v === '' ? <span className="text-muted-foreground">—</span> : v}</span>
          </div>
        ))}
      </div>
      {row.raw_headers && (
        <details open>
          <summary className="cursor-pointer text-muted-foreground uppercase text-[10px] tracking-wide">headers</summary>
          <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted p-3 rounded mt-1">
            {JSON.stringify(row.raw_headers, null, 2)}
          </pre>
        </details>
      )}
      {row.raw_payload !== undefined && (
        <details open>
          <summary className="cursor-pointer text-muted-foreground uppercase text-[10px] tracking-wide">payload</summary>
          <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted p-3 rounded mt-1">
            {JSON.stringify(row.raw_payload, null, 2)}
          </pre>
        </details>
      )}
      {(row.payload !== undefined || row.external_response !== undefined) && (
        <details>
          <summary className="cursor-pointer text-muted-foreground uppercase text-[10px] tracking-wide">job payload / response</summary>
          <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted p-3 rounded mt-1">
            {JSON.stringify({ payload: row.payload, external_response: row.external_response }, null, 2)}
          </pre>
        </details>
      )}
      <details>
        <summary className="cursor-pointer text-muted-foreground uppercase text-[10px] tracking-wide">raw row (all columns)</summary>
        <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted p-3 rounded mt-1">
          {JSON.stringify(row, null, 2)}
        </pre>
      </details>
    </div>
  );
}
