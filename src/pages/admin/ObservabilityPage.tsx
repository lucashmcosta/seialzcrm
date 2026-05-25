import { useEffect, useMemo, useState, useCallback } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, AlertTriangle, CheckCircle2, AlertOctagon } from 'lucide-react';

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
  id: string;
  received_at: string;
  integration_slug: string;
  source_event: string | null;
  process_status: string;
  shadow_mode: boolean | null;
  signature_valid: boolean | null;
  retry_count: number | null;
  trace_id: string | null;
  external_id: string | null;
  organization_id: string | null;
  process_error: string | null;
  raw_payload?: any;
  raw_headers?: any;
}

interface IngestError {
  id: string;
  created_at: string;
  integration_slug: string;
  error_code: string | null;
  error_message: string | null;
  trace_id: string | null;
  external_id: string | null;
}

interface OutboxHealth {
  pending: number;
  running: number;
  running_stuck_5m: number;
  failed: number;
  dead_letter: number;
  success_24h: number;
  failed_24h: number;
  subscriptions_active: number;
  subscriptions_paused: number;
  worker_last_run_at: string | null;
  reaper_last_run_at: string | null;
  generated_at: string;
}

interface IntegrationJob {
  id: string;
  created_at: string;
  integration_slug: string;
  target_action: string;
  status: string;
  attempts: number | null;
  max_attempts: number | null;
  next_run_at: string | null;
  organization_id: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  payload?: any;
  external_response?: any;
}

interface IntegrationEvent {
  id: string;
  occurred_at: string;
  event_type: string;
  status: string;
  organization_id: string | null;
}

interface Subscription {
  id: string;
  integration_slug: string;
  event_type: string;
  target_action: string;
  is_active: boolean;
  paused_until: string | null;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function fmtTime(ts: string | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString();
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
    case 'processed':
    case 'success':
      return 'default';
    case 'received':
    case 'pending':
    case 'processing':
    case 'running':
      return 'secondary';
    case 'retry':
      return 'outline';
    case 'dead_letter':
    case 'failed':
    case 'expired':
      return 'destructive';
    default:
      return 'outline';
  }
}

function p95(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
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
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'warning' | 'critical' | 'success';
}) {
  const toneClass =
    tone === 'critical'
      ? 'text-destructive'
      : tone === 'warning'
      ? 'text-amber-500'
      : tone === 'success'
      ? 'text-emerald-500'
      : 'text-foreground';
  return (
    <Card noAnimation>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------
// Main Page
// ------------------------------------------------------------------

export default function ObservabilityPage() {
  const [tab, setTab] = useState<'inbox' | 'outbox'>('inbox');
  const [windowSel, setWindowSel] = useState<Window>('24h');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Inbox state
  const [inboundHealth1h, setInboundHealth1h] = useState<InboundHealthRow[]>([]);
  const [inboundHealthWin, setInboundHealthWin] = useState<InboundHealthRow[]>([]);
  const [inboundEvents, setInboundEvents] = useState<InboundEvent[]>([]);
  const [ingestErrors, setIngestErrors] = useState<IngestError[]>([]);
  const [inboundStuck, setInboundStuck] = useState<number>(0);
  const [inboundShadow, setInboundShadow] = useState<number>(0);
  const [inboundSigFailures, setInboundSigFailures] = useState<number>(0);
  const [inboundLatencies, setInboundLatencies] = useState<number[]>([]);

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
    { integration_slug: string; target_action: string; count: number; last_error: string | null }[]
  >([]);
  const [outboxLatencies, setOutboxLatencies] = useState<number[]>([]);
  const [topErrors, setTopErrors] = useState<{ message: string; count: number }[]>([]);

  // Drill-down
  const [drillRow, setDrillRow] = useState<any>(null);
  const [drillTitle, setDrillTitle] = useState<string>('');

  const sinceISO = useMemo(
    () => new Date(Date.now() - WINDOW_TO_MS[windowSel]).toISOString(),
    [windowSel],
  );
  const since1hISO = useMemo(() => new Date(Date.now() - 3600_000).toISOString(), [lastUpdated]);
  const since24hISO = useMemo(() => new Date(Date.now() - 86_400_000).toISOString(), [lastUpdated]);

  // ----------------------------------------------------------------
  // Fetch
  // ----------------------------------------------------------------

  const fetchInbox = useCallback(async () => {
    const errors: string[] = [];

    // Health summary (RPC) — 1h and selected window
    try {
      const { data: h1, error: e1 } = await (supabase as any).rpc('fn_inbound_health_summary', {
        _window: '1 hour',
      });
      if (e1) throw e1;
      setInboundHealth1h(h1 || []);
    } catch (e: any) {
      errors.push(`inbound_health_1h: ${e.message}`);
      // Fallback: aggregate from table
      const { data } = await (supabase as any)
        .from('integration_inbound_events')
        .select('integration_slug, process_status')
        .gte('received_at', since1hISO)
        .limit(5000);
      const agg: Record<string, InboundHealthRow> = {};
      (data || []).forEach((r: any) => {
        const k = `${r.integration_slug}::${r.process_status}`;
        if (!agg[k]) {
          agg[k] = {
            integration_slug: r.integration_slug,
            status: r.process_status,
            count: 0,
            avg_latency_sec: null,
            p95_latency_sec: null,
          };
        }
        agg[k].count += 1;
      });
      setInboundHealth1h(Object.values(agg));
    }

    try {
      const { data: hw, error: ew } = await (supabase as any).rpc('fn_inbound_health_summary', {
        _window: WINDOW_TO_INTERVAL[windowSel],
      });
      if (ew) throw ew;
      setInboundHealthWin(hw || []);
    } catch (e: any) {
      errors.push(`inbound_health_win: ${e.message}`);
      setInboundHealthWin([]);
    }

    // Recent events list (filtered)
    let q = (supabase as any)
      .from('integration_inbound_events')
      .select(
        'id, received_at, integration_slug, source_event, process_status, shadow_mode, signature_valid, retry_count, trace_id, external_id, organization_id, process_error, processed_at',
      )
      .gte('received_at', sinceISO)
      .order('received_at', { ascending: false })
      .limit(100);

    if (providerFilter !== 'all') q = q.eq('integration_slug', providerFilter);
    if (statusFilter !== 'all') q = q.eq('process_status', statusFilter);
    if (orgFilter) q = q.eq('organization_id', orgFilter);
    if (search) {
      const s = search.trim();
      // Try trace_id / external_id matches
      q = q.or(`trace_id.eq.${s},external_id.eq.${s}`);
    }
    const { data: evs, error: evErr } = await q;
    if (evErr) errors.push(`events: ${evErr.message}`);
    setInboundEvents(evs || []);

    // Latencies for p50/p95 (processed only)
    const lats: number[] = [];
    (evs || []).forEach((e: any) => {
      if (e.processed_at && e.received_at) {
        const d = (new Date(e.processed_at).getTime() - new Date(e.received_at).getTime()) / 1000;
        if (d >= 0 && d < 86400 * 30) lats.push(d);
      }
    });
    setInboundLatencies(lats);

    // Stuck processing > 5min
    const { count: stuckCount } = await (supabase as any)
      .from('integration_inbound_events')
      .select('id', { count: 'exact', head: true })
      .eq('process_status', 'processing')
      .lt('claimed_at', new Date(Date.now() - 5 * 60_000).toISOString());
    setInboundStuck(stuckCount || 0);

    // Shadow mode count (window)
    const { count: shadow } = await (supabase as any)
      .from('integration_inbound_events')
      .select('id', { count: 'exact', head: true })
      .eq('shadow_mode', true)
      .gte('received_at', sinceISO);
    setInboundShadow(shadow || 0);

    // Signature failures last 24h
    const { count: sig } = await (supabase as any)
      .from('integration_inbound_events')
      .select('id', { count: 'exact', head: true })
      .eq('signature_valid', false)
      .gte('received_at', since24hISO);
    setInboundSigFailures(sig || 0);

    // Ingest errors last 24h
    const { data: ierrs, error: ierr } = await (supabase as any)
      .from('integration_inbound_ingest_errors')
      .select('id, created_at, integration_slug, error_code, error_message, trace_id, external_id')
      .gte('created_at', since24hISO)
      .order('created_at', { ascending: false })
      .limit(50);
    if (ierr) errors.push(`ingest_errors: ${ierr.message}`);
    setIngestErrors(ierrs || []);

    if (errors.length) setError(errors.join(' | '));
  }, [windowSel, providerFilter, statusFilter, orgFilter, search, since1hISO, since24hISO, sinceISO]);

  const fetchOutbox = useCallback(async () => {
    const errs: string[] = [];

    // Health summary RPC
    try {
      const { data, error: err } = await (supabase as any).rpc('fn_outbox_health_summary');
      if (err) throw err;
      setOutboxHealth(data as OutboxHealth);
      setOutboxHealthErr(null);
    } catch (e: any) {
      setOutboxHealth(null);
      setOutboxHealthErr(e.message);
    }

    // Counts
    const { count: ec1 } = await (supabase as any)
      .from('integration_events')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', since1hISO);
    setEventsCount1h(ec1 || 0);
    const { count: ec24 } = await (supabase as any)
      .from('integration_events')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', since24hISO);
    setEventsCount24h(ec24 || 0);
    const { count: jc1 } = await (supabase as any)
      .from('integration_jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since1hISO);
    setJobsCount1h(jc1 || 0);
    const { count: jc24 } = await (supabase as any)
      .from('integration_jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since24hISO);
    setJobsCount24h(jc24 || 0);

    // Recent jobs (filtered)
    let qj = (supabase as any)
      .from('integration_jobs')
      .select(
        'id, created_at, integration_slug, target_action, status, attempts, max_attempts, next_run_at, organization_id, last_error, idempotency_key, started_at, completed_at',
      )
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(100);
    if (providerFilter !== 'all') qj = qj.eq('integration_slug', providerFilter);
    if (statusFilter !== 'all') qj = qj.eq('status', statusFilter);
    if (orgFilter) qj = qj.eq('organization_id', orgFilter);
    if (search) qj = qj.eq('idempotency_key', search.trim());
    const { data: jobsData, error: jErr } = await qj;
    if (jErr) errs.push(`jobs: ${jErr.message}`);
    setJobs(jobsData || []);

    // Outbox latencies (event published_at → job success completed_at)
    // Approximate by event-id join, lightweight
    const { data: succJobs } = await (supabase as any)
      .from('integration_jobs')
      .select('event_id, completed_at, created_at')
      .eq('status', 'success')
      .gte('completed_at', since24hISO)
      .not('completed_at', 'is', null)
      .limit(500);
    const eventIds = Array.from(new Set((succJobs || []).map((j: any) => j.event_id).filter(Boolean)));
    let evMap: Record<string, string> = {};
    if (eventIds.length) {
      const { data: evRows } = await (supabase as any)
        .from('integration_events')
        .select('id, published_at, occurred_at')
        .in('id', eventIds.slice(0, 500));
      (evRows || []).forEach((e: any) => {
        evMap[e.id] = e.published_at || e.occurred_at;
      });
    }
    const olats: number[] = [];
    (succJobs || []).forEach((j: any) => {
      const pub = evMap[j.event_id];
      if (pub && j.completed_at) {
        const d = (new Date(j.completed_at).getTime() - new Date(pub).getTime()) / 1000;
        if (d >= 0 && d < 86400) olats.push(d);
      }
    });
    setOutboxLatencies(olats);

    // DLQ grouped by integration/action
    const { data: dlq } = await (supabase as any)
      .from('integration_jobs')
      .select('integration_slug, target_action, last_error')
      .eq('status', 'dead_letter')
      .limit(500);
    const dlqAgg: Record<string, { integration_slug: string; target_action: string; count: number; last_error: string | null }> = {};
    (dlq || []).forEach((r: any) => {
      const k = `${r.integration_slug}::${r.target_action}`;
      if (!dlqAgg[k]) {
        dlqAgg[k] = { integration_slug: r.integration_slug, target_action: r.target_action, count: 0, last_error: r.last_error };
      }
      dlqAgg[k].count += 1;
      if (r.last_error) dlqAgg[k].last_error = r.last_error;
    });
    setDlqByIntegration(Object.values(dlqAgg).sort((a, b) => b.count - a.count));

    // Top errors (last 24h)
    const { data: errSamples } = await (supabase as any)
      .from('integration_jobs')
      .select('last_error')
      .in('status', ['failed', 'dead_letter'])
      .gte('last_error_at', since24hISO)
      .not('last_error', 'is', null)
      .limit(500);
    const errAgg: Record<string, number> = {};
    (errSamples || []).forEach((r: any) => {
      const msg = (r.last_error || '').slice(0, 160);
      errAgg[msg] = (errAgg[msg] || 0) + 1;
    });
    setTopErrors(
      Object.entries(errAgg)
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    );

    // Subscriptions
    const { data: subs } = await (supabase as any)
      .from('integration_subscriptions')
      .select('id, integration_slug, event_type, target_action, is_active, paused_until')
      .order('integration_slug', { ascending: true })
      .limit(200);
    setSubscriptions(subs || []);

    if (errs.length) setError((prev) => [prev, ...errs].filter(Boolean).join(' | '));
  }, [providerFilter, statusFilter, orgFilter, search, sinceISO, since1hISO, since24hISO]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchInbox(), fetchOutbox()]);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchInbox, fetchOutbox]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSel, providerFilter, statusFilter, orgFilter]);

  // ----------------------------------------------------------------
  // Derived
  // ----------------------------------------------------------------

  const inboundByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    inboundHealthWin.forEach((r) => {
      m[r.status] = (m[r.status] || 0) + Number(r.count);
    });
    return m;
  }, [inboundHealthWin]);

  const inboundByProvider = useMemo(() => {
    const m: Record<string, number> = {};
    inboundHealthWin.forEach((r) => {
      m[r.integration_slug] = (m[r.integration_slug] || 0) + Number(r.count);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [inboundHealthWin]);

  const inboundTotal1h = useMemo(
    () => inboundHealth1h.reduce((s, r) => s + Number(r.count || 0), 0),
    [inboundHealth1h],
  );
  const inboundTotalWin = useMemo(
    () => inboundHealthWin.reduce((s, r) => s + Number(r.count || 0), 0),
    [inboundHealthWin],
  );

  const allProviders = useMemo(() => {
    const set = new Set<string>();
    inboundHealthWin.forEach((r) => set.add(r.integration_slug));
    jobs.forEach((j) => set.add(j.integration_slug));
    subscriptions.forEach((s) => set.add(s.integration_slug));
    return Array.from(set).sort();
  }, [inboundHealthWin, jobs, subscriptions]);

  const allStatuses = useMemo(() => {
    if (tab === 'inbox')
      return ['received', 'processing', 'retry', 'processed', 'dead_letter', 'expired', 'archived'];
    return ['pending', 'running', 'success', 'failed', 'retry', 'dead_letter'];
  }, [tab]);

  // Health classification
  const healthLevel: 'healthy' | 'warning' | 'critical' = useMemo(() => {
    const stuckIn = inboundStuck;
    const stuckOut = outboxHealth?.running_stuck_5m ?? 0;
    const dlqOut = outboxHealth?.dead_letter ?? 0;
    const ingest = ingestErrors.length;
    const sig = inboundSigFailures;

    if (
      stuckIn > 10 ||
      stuckOut > 10 ||
      outboxHealthErr ||
      (error && error.includes('events:'))
    )
      return 'critical';
    if (stuckIn > 0 || stuckOut > 0 || ingest > 0 || sig > 0 || dlqOut > 0) return 'warning';
    return 'healthy';
  }, [inboundStuck, outboxHealth, outboxHealthErr, ingestErrors.length, inboundSigFailures, error]);

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Observabilidade</h1>
            <HealthPill level={healthLevel} />
          </div>
          <div className="flex items-center gap-2">
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
          Painel <span className="font-medium">read-only</span>. Nenhum botão modifica dados. Nenhuma feature flag, cron ou webhook é alterado.
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
                  {allProviders.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {allStatuses.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="organization_id">
              <Input
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
                placeholder="uuid"
                className="w-72"
              />
            </Field>
            <Field label="Buscar trace_id / external_id / idempotency_key">
              <div className="flex gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && refresh()}
                  placeholder="cole aqui e Enter"
                  className="w-80"
                />
                <Button size="sm" variant="outline" onClick={refresh}>Buscar</Button>
              </div>
            </Field>
          </CardContent>
        </Card>

        {error && (
          <div className="text-xs text-destructive border border-destructive/40 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="outbox">Outbox</TabsTrigger>
          </TabsList>

          {/* ============================== INBOX ============================== */}
          <TabsContent value="inbox" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Eventos 1h" value={inboundTotal1h} />
              <StatCard label={`Eventos ${windowSel}`} value={inboundTotalWin} />
              <StatCard
                label="Stuck processing > 5m"
                value={inboundStuck}
                tone={inboundStuck > 10 ? 'critical' : inboundStuck > 0 ? 'warning' : 'success'}
              />
              <StatCard label="Shadow mode" value={inboundShadow} hint={`janela ${windowSel}`} />
              <StatCard
                label="Signature failures 24h"
                value={inboundSigFailures}
                tone={inboundSigFailures > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="Ingest errors 24h"
                value={ingestErrors.length}
                tone={ingestErrors.length > 0 ? 'warning' : 'success'}
              />
              <StatCard label="p50 latency" value={fmtLatency(p50(inboundLatencies))} hint="received→processed" />
              <StatCard label="p95 latency" value={fmtLatency(p95(inboundLatencies))} hint="received→processed" />
            </div>

            {/* By status / by provider */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card noAnimation>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Por status (janela {windowSel})</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {Object.entries(inboundByStatus).length === 0 && <div className="text-muted-foreground text-xs">Sem dados.</div>}
                  {Object.entries(inboundByStatus).map(([s, c]) => (
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
                  {inboundByProvider.length === 0 && <div className="text-muted-foreground text-xs">Sem dados.</div>}
                  {inboundByProvider.map(([p, c]) => (
                    <div key={p} className="flex justify-between">
                      <span>{p}</span>
                      <span className="font-mono">{c}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Ingest errors */}
            <Card noAnimation>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ingest errors (24h)</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-24" /> : ingestErrors.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Nenhum erro de ingestão.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Mensagem</TableHead>
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
              <CardHeader className="pb-2"><CardTitle className="text-sm">Eventos recentes ({inboundEvents.length})</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-40" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Shadow</TableHead>
                        <TableHead>Sig</TableHead>
                        <TableHead>Retry</TableHead>
                        <TableHead>trace</TableHead>
                        <TableHead>external</TableHead>
                        <TableHead>org</TableHead>
                        <TableHead>error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inboundEvents.map((e) => (
                        <TableRow key={e.id} className="cursor-pointer" onClick={() => { setDrillRow(e); setDrillTitle('Inbound event'); }}>
                          <TableCell className="whitespace-nowrap text-xs">{fmtRelative(e.received_at)}</TableCell>
                          <TableCell className="text-xs">{e.integration_slug}</TableCell>
                          <TableCell className="text-xs">{e.source_event || '—'}</TableCell>
                          <TableCell><Badge variant={statusVariant(e.process_status)}>{e.process_status}</Badge></TableCell>
                          <TableCell className="text-xs">{e.shadow_mode ? '✓' : ''}</TableCell>
                          <TableCell className="text-xs">{e.signature_valid === false ? '✗' : e.signature_valid ? '✓' : '—'}</TableCell>
                          <TableCell className="text-xs">{e.retry_count ?? 0}</TableCell>
                          <TableCell className="font-mono text-xs">{e.trace_id?.slice(0, 8) || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{e.external_id?.slice(0, 12) || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{e.organization_id?.slice(0, 8) || '—'}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-destructive">{e.process_error || ''}</TableCell>
                        </TableRow>
                      ))}
                      {inboundEvents.length === 0 && (
                        <TableRow><TableCell colSpan={11} className="text-center text-xs text-muted-foreground">Sem eventos.</TableCell></TableRow>
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
              <StatCard label="Events 1h" value={eventsCount1h} />
              <StatCard label="Events 24h" value={eventsCount24h} />
              <StatCard label="Jobs 1h" value={jobsCount1h} />
              <StatCard label="Jobs 24h" value={jobsCount24h} />
              <StatCard label="Pending" value={outboxHealth?.pending ?? '—'} />
              <StatCard
                label="Running"
                value={outboxHealth?.running ?? '—'}
                hint={`stuck>5m: ${outboxHealth?.running_stuck_5m ?? 0}`}
                tone={(outboxHealth?.running_stuck_5m ?? 0) > 10 ? 'critical' : (outboxHealth?.running_stuck_5m ?? 0) > 0 ? 'warning' : 'default'}
              />
              <StatCard
                label="Dead letter"
                value={outboxHealth?.dead_letter ?? '—'}
                tone={(outboxHealth?.dead_letter ?? 0) > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="Success 24h"
                value={outboxHealth?.success_24h ?? '—'}
                hint={`failed: ${outboxHealth?.failed_24h ?? 0}`}
                tone="success"
              />
              <StatCard label="p50 latency" value={fmtLatency(p50(outboxLatencies))} hint="published→success" />
              <StatCard label="p95 latency" value={fmtLatency(p95(outboxLatencies))} hint="published→success" />
              <StatCard
                label="Subscriptions"
                value={`${outboxHealth?.subscriptions_active ?? 0} / ${(outboxHealth?.subscriptions_active ?? 0) + (outboxHealth?.subscriptions_paused ?? 0)}`}
                hint="ativas / total"
              />
              <StatCard
                label="Worker last run"
                value={outboxHealth?.worker_last_run_at ? fmtRelative(outboxHealth.worker_last_run_at) : '—'}
                hint={`reaper: ${outboxHealth?.reaper_last_run_at ? fmtRelative(outboxHealth.reaper_last_run_at) : '—'}`}
              />
            </div>

            {outboxHealthErr && (
              <div className="text-xs text-destructive border border-destructive/40 rounded px-3 py-2">
                fn_outbox_health_summary falhou: {outboxHealthErr}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <Card noAnimation>
                <CardHeader className="pb-2"><CardTitle className="text-sm">DLQ por integração</CardTitle></CardHeader>
                <CardContent>
                  {dlqByIntegration.length === 0 ? <div className="text-xs text-muted-foreground">Sem itens em DLQ.</div> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provider</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead>Último erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dlqByIntegration.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{r.integration_slug}</TableCell>
                            <TableCell className="text-xs">{r.target_action}</TableCell>
                            <TableCell className="text-right font-mono">{r.count}</TableCell>
                            <TableCell className="max-w-xs truncate text-xs">{r.last_error || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card noAnimation>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top errors (24h)</CardTitle></CardHeader>
                <CardContent>
                  {topErrors.length === 0 ? <div className="text-xs text-muted-foreground">Sem erros.</div> : (
                    <div className="space-y-1 text-xs">
                      {topErrors.map((e, i) => (
                        <div key={i} className="flex justify-between gap-2">
                          <span className="truncate max-w-md">{e.message}</span>
                          <span className="font-mono">{e.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Jobs table */}
            <Card noAnimation>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Jobs recentes ({jobs.length})</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-40" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Next run</TableHead>
                        <TableHead>org</TableHead>
                        <TableHead>idem_key</TableHead>
                        <TableHead>error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j) => (
                        <TableRow key={j.id} className="cursor-pointer" onClick={() => { setDrillRow(j); setDrillTitle('Outbox job'); }}>
                          <TableCell className="whitespace-nowrap text-xs">{fmtRelative(j.created_at)}</TableCell>
                          <TableCell className="text-xs">{j.integration_slug}</TableCell>
                          <TableCell className="text-xs">{j.target_action}</TableCell>
                          <TableCell><Badge variant={statusVariant(j.status)}>{j.status}</Badge></TableCell>
                          <TableCell className="text-xs">{j.attempts ?? 0}/{j.max_attempts ?? '—'}</TableCell>
                          <TableCell className="text-xs">{j.next_run_at ? fmtRelative(j.next_run_at) : '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{j.organization_id?.slice(0, 8) || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{j.idempotency_key?.slice(0, 12) || '—'}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-destructive">{j.last_error || ''}</TableCell>
                        </TableRow>
                      ))}
                      {jobs.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground">Sem jobs.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Subscriptions */}
            <Card noAnimation>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Subscriptions ({subscriptions.length})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Event type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Ativa</TableHead>
                      <TableHead>Pausada até</TableHead>
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Drill-down modal */}
      <Dialog open={!!drillRow} onOpenChange={(o) => !o && setDrillRow(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>{drillTitle}</DialogTitle></DialogHeader>
          <pre className="text-xs whitespace-pre-wrap break-all bg-muted p-3 rounded">
            {drillRow ? JSON.stringify(drillRow, null, 2) : ''}
          </pre>
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

function HealthPill({ level }: { level: 'healthy' | 'warning' | 'critical' }) {
  if (level === 'healthy') {
    return (
      <Badge className="bg-emerald-500 hover:bg-emerald-500">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Healthy
      </Badge>
    );
  }
  if (level === 'warning') {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500">
        <AlertTriangle className="h-3 w-3 mr-1" /> Warning
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <AlertOctagon className="h-3 w-3 mr-1" /> Critical
    </Badge>
  );
}
