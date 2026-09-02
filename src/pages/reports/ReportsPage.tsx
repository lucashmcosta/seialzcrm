import { useEffect, useMemo, useState, Suspense } from 'react';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { Navigate, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import {
  ChartLineUp,
  Briefcase,
  CheckCircle,
  XCircle,
  Trophy,
  CurrencyDollar,
  Clock,
  Target,
  Users,
  Timer,
  ChatsCircle,
  ClockClockwise,
  Headset,
} from '@phosphor-icons/react';
import { useServiceStats } from '@/hooks/useServiceStats';
import { formatSeconds } from '@/lib/format-duration';
import { SalesTrendChart, type TrendPoint } from '@/components/reports/SalesTrendChart';
import { PipelineFunnel, type FunnelStage } from '@/components/reports/PipelineFunnel';
import { UserLeaderboard, type UserStats } from '@/components/reports/UserLeaderboard';
import { KpiCard } from '@/components/reports/KpiCard';
import { WinRateGauge } from '@/components/reports/WinRateGauge';
import { StageDistribution } from '@/components/reports/StageDistribution';
import UserDetailDialog from '@/components/reports/UserDetailDialog';
import { ServiceResponseDetailDialog } from '@/components/reports/ServiceResponseDetailDialog';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { computeRange, type PeriodPreset, type CustomRange } from '@/lib/report-period';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { MobileReports } from '@/components/mobile/MobileReports';
import { useSalesDashboardStats } from '@/hooks/useSalesDashboardStats';

const BlockFallback = ({ className = 'h-32' }: { className?: string }) => (
  <div className={`animate-pulse rounded-md bg-muted/50 ${className}`} />
);

/**
 * Parse a YYYY-MM-DD date string as LOCAL midnight (not UTC).
 * `new Date("2026-05-11")` produces UTC midnight, which in BR (UTC-3) becomes
 * 2026-05-10T21:00 local — pushing close_date values one day back and causing
 * report counts to disagree with the Kanban (which compares as date strings
 * server-side).
 */
const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const fmtDay = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface DetailOpp {
  id: string;
  title: string | null;
  amount: number | null;
  status: string;
  created_at: string;
  close_date: string | null;
  contacts?: { full_name: string | null } | null;
  users?: { full_name: string | null } | null;
}

interface Stage {
  id: string;
  name: string;
  order_index: number;
}

interface UserRow {
  id: string;
  full_name: string;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export default function ReportsPage() {
  const { organization, locale } = useOrganization();
  const { permissions, loading: permsLoading } = usePermissions();
  const navigate = useNavigate();

  const isMobile = useIsMobile();

  const [preset, setPreset, , presetHydrated] = usePersistedFilters<PeriodPreset>('reports.preset', 'last_30');
  const [customRange, setCustomRange, , customHydrated] = usePersistedFilters<CustomRange | undefined>(
    'reports.customRange',
    undefined,
    (raw) => {
      if (!raw || typeof raw !== 'object') return undefined;
      return {
        from: raw.from ? new Date(raw.from) : undefined,
        to: raw.to ? new Date(raw.to) : undefined,
      };
    },
  );
  const [ownerId, setOwnerId, , ownerHydrated] = usePersistedFilters<string>('reports.ownerId', 'all');
  const filtersHydrated = presetHydrated && customHydrated && ownerHydrated;

  const range = useMemo(() => computeRange(preset, customRange), [preset, customRange]);
  const rangeKey = `${range.from.toISOString()}_${range.to.toISOString()}`;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(null);
  const [detail, setDetail] = useState<null | 'won' | 'lost' | 'created'>(null);
  const [detailRows, setDetailRows] = useState<DetailOpp[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [serviceDetail, setServiceDetail] = useState<null | 'first' | 'all'>(null);

  const { data: dashboard, loading } = useSalesDashboardStats({
    organizationId: organization?.id,
    from: range.from,
    to: range.to,
    ownerId,
    enabled: filtersHydrated,
  });

  const { data: serviceStats, loading: serviceLoading } = useServiceStats({
    organizationId: organization?.id,
    from: range.from,
    to: range.to,
    ownerId,
    refreshKey: rangeKey,
  });

  useEffect(() => {
    if (!organization) return;
    fetchUsersAndStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  async function fetchUsersAndStages() {
    if (!organization) return;
    const [{ data: uo }, { data: st }] = await Promise.all([
      supabase
        .from('user_organizations')
        .select('user_id, users(id, full_name)')
        .eq('organization_id', organization.id)
        .eq('is_active', true),
      supabase
        .from('pipeline_stages')
        .select('id, name, order_index')
        .eq('organization_id', organization.id)
        .eq('type', 'custom')
        .order('order_index'),
    ]);

    if (uo) {
      setUsers(
        uo
          .filter((r: any) => r.users)
          .map((r: any) => ({ id: r.users.id, full_name: r.users.full_name })),
      );
    }
    if (st) setStages(st as Stage[]);
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: organization?.default_currency || 'BRL',
      maximumFractionDigits: 0,
    }).format(n || 0);

  // ─────────────────────────────────────────
  // KPIs (from the aggregated RPC)
  // ─────────────────────────────────────────
  const stats = useMemo(() => {
    const k = dashboard.kpis;

    const delta = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return ((curr - prev) / prev) * 100;
    };

    const createdCount = num(k.created_count);
    const prevCreatedCount = num(k.created_count_prev);
    const wonValue = num(k.won_value);
    const prevWonValue = num(k.won_value_prev);
    const winRate = num(k.win_rate);
    const prevWinRate = num(k.win_rate_prev);

    return {
      createdCount,
      createdDelta: delta(createdCount, prevCreatedCount),
      wonCount: num(k.won_count),
      wonValue,
      wonValueDelta: delta(wonValue, prevWonValue),
      lostCount: num(k.lost_count),
      lostValue: num(k.lost_value),
      winRate,
      winRateDelta: delta(winRate, prevWinRate),
      avgTicket: num(k.avg_ticket),
      avgCycle: num(k.avg_cycle_days),
    };
  }, [dashboard]);

  const openCount = num(dashboard.kpis.open_count);
  const openValue = num(dashboard.kpis.open_value);

  // Funnel & distribution — ordered by pipeline stage order
  const funnel: FunnelStage[] = useMemo(() => {
    const byName = new Map(dashboard.funnel.map((f) => [String(f.name), f]));
    const ordered: FunnelStage[] = stages.map((s) => {
      const r = byName.get(s.name);
      byName.delete(s.name);
      return { name: s.name, count: num(r?.count), value: num(r?.value) };
    });
    byName.forEach((r) => {
      ordered.push({ name: String(r.name), count: num(r.count), value: num(r.value) });
    });
    return ordered;
  }, [stages, dashboard]);

  // Trend — same axis/bucket rule as before, values from the RPC
  const trend: TrendPoint[] = useMemo(() => {
    const fromDate = range.from;
    const toDate = range.to;
    const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
    const isMonthly = days > 90;
    const points: TrendPoint[] = [];

    if (isMonthly) {
      const startMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
      const endMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
      const cursor = new Date(startMonth);
      while (cursor <= endMonth) {
        const key = cursor.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
        points.push({ date: key, created: 0, won: 0, wonValue: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      const cursor = new Date(fromDate);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        const key = cursor.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
        points.push({ date: key, created: 0, won: 0, wonValue: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const matchKey = (date: Date) =>
      isMonthly
        ? date.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
        : date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

    const index = new Map(points.map((p, i) => [p.date, i]));

    dashboard.trend.forEach((t) => {
      const d = parseLocalDate(String(t.bucket_date));
      if (!d) return;
      const idx = index.get(matchKey(d));
      if (idx == null) return;
      points[idx].created += num(t.created);
      points[idx].won += num(t.won);
      points[idx].wonValue += num(t.won_value);
    });

    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard, rangeKey, locale]);

  // Per-user stats
  const userStats: UserStats[] = useMemo(() => {
    return dashboard.leaderboard
      .map((l) => {
        const uid = String(l.user_id);
        const known = users.find((u) => u.id === uid);
        return {
          userId: uid,
          fullName: known?.full_name || l.full_name || 'Sem responsável',
          open: num(l.open),
          created: num(l.created),
          won: num(l.won),
          lost: num(l.lost),
          wonValue: num(l.won_value),
        } as UserStats;
      })
      .filter((r) => r.open > 0 || r.created > 0 || r.won > 0 || r.lost > 0);
  }, [dashboard, users]);

  // ─────────────────────────────────────────
  // Detail dialog rows — fetched ON DEMAND only (never on page load)
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!detail || !organization) {
      setDetailRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const sel = (s: string): string => s;
        let q = supabase
          .from('opportunities')
          .select(
            sel(
              'id, title, amount, status, created_at, close_date, contacts:contact_id(full_name), users:owner_user_id(full_name)',
            ),
          )
          .eq('organization_id', organization.id)
          .is('deleted_at', null);

        if (ownerId !== 'all') q = q.eq('owner_user_id', ownerId);

        if (detail === 'created') {
          q = q
            .gte('created_at', range.from.toISOString())
            .lte('created_at', range.to.toISOString())
            .order('created_at', { ascending: false });
        } else {
          q = q
            .eq('status', detail)
            .gte('close_date', fmtDay(range.from))
            .lte('close_date', fmtDay(range.to))
            .order('close_date', { ascending: false });
        }

        const { data, error } = await q.limit(500);
        if (error) throw error;
        if (!cancelled) setDetailRows((data ?? []) as unknown as DetailOpp[]);
      } catch (e) {
        console.error('Reports detail fetch error:', e);
        if (!cancelled) setDetailRows([]);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, organization?.id, rangeKey, ownerId]);

  const detailCount =
    detail === 'created'
      ? stats.createdCount
      : detail === 'won'
        ? stats.wonCount
        : detail === 'lost'
          ? stats.lostCount
          : 0;

  // Permission gate (after hooks to satisfy Rules of Hooks)
  if (!permsLoading && !permissions.canManageSettings) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isMobile) {
    return (
      <MobileLayout>
        <MobileReports
          preset={preset}
          onPresetChange={setPreset}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          ownerId={ownerId}
          onOwnerChange={setOwnerId}
          users={users}
          loading={loading}
          stats={stats}
          openCount={openCount}
          openValue={openValue}
          trend={trend}
          funnel={funnel}
          userStats={userStats}
          formatCurrency={formatCurrency}
          serviceStats={serviceStats}
          serviceLoading={serviceLoading}
        />
      </MobileLayout>
    );
  }

  return (
    <Layout>
      <div className="min-h-full">
        {/* Header */}
        <div className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <ChartLineUp size={22} weight="duotone" className="text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Dashboards</h1>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6 pb-10">
            {/* Filters */}
            <ReportFilters
              preset={preset}
              onPresetChange={setPreset}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
              ownerId={ownerId}
              onOwnerChange={setOwnerId}
              users={users}
            />

            {/* KPI row */}
            <Suspense fallback={<BlockFallback className="h-32" />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Oportunidades criadas"
                  value={stats.createdCount}
                  delta={stats.createdDelta}
                  icon={Briefcase}
                  accent="info"
                  loading={loading}
                  onClick={() => setDetail('created')}
                />
                <KpiCard
                  label="Ganhas"
                  value={stats.wonCount}
                  sublabel={formatCurrency(stats.wonValue)}
                  delta={stats.wonValueDelta}
                  icon={CheckCircle}
                  accent="success"
                  loading={loading}
                  onClick={() => setDetail('won')}
                />
                <KpiCard
                  label="Perdidas"
                  value={stats.lostCount}
                  sublabel={formatCurrency(stats.lostValue)}
                  icon={XCircle}
                  accent="destructive"
                  loading={loading}
                  onClick={() => setDetail('lost')}
                />

                <KpiCard
                  label="Conversão"
                  value={`${stats.winRate.toFixed(1)}%`}
                  delta={stats.winRateDelta}
                  icon={Target}
                  accent="orange"
                  loading={loading}
                  mono
                />
              </div>
            </Suspense>

            {/* Win rate gauge + secondary KPIs */}
            <Suspense fallback={<BlockFallback className="h-64" />}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <WinRateGauge
                  rate={stats.winRate}
                  wonCount={stats.wonCount}
                  createdCount={stats.createdCount}
                  loading={loading}
                />
                <div className="lg:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <KpiCard
                    label="Ticket médio (ganhas)"
                    value={formatCurrency(stats.avgTicket)}
                    icon={CurrencyDollar}
                    accent="success"
                    loading={loading}
                    mono
                  />
                  <KpiCard
                    label="Ciclo médio de venda"
                    value={`${stats.avgCycle.toFixed(0)} dias`}
                    icon={Clock}
                    accent="primary"
                    loading={loading}
                    mono
                  />
                  <KpiCard
                    label="Pipeline aberto (qtd)"
                    value={openCount}
                    icon={Briefcase}
                    accent="warning"
                    loading={loading}
                  />
                  <KpiCard
                    label="Pipeline aberto (valor)"
                    value={formatCurrency(openValue)}
                    icon={Trophy}
                    accent="warning"
                    loading={loading}
                    mono
                  />
                </div>
              </div>
            </Suspense>

            {/* Atendimento */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Headset size={18} weight="duotone" className="text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Atendimento</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard
                  label="Pessoas em contato"
                  value={serviceStats.contactsCount}
                  icon={Users}
                  accent="primary"
                  loading={serviceLoading}
                />
                <KpiCard
                  label="Tempo médio 1ª resposta"
                  value={formatSeconds(serviceStats.avgFirstResponseSeconds)}
                  icon={Timer}
                  accent="warning"
                  loading={serviceLoading}
                  mono
                  onClick={() => setServiceDetail('first')}
                />
                <KpiCard
                  label="Encerrados"
                  value={serviceStats.resolvedCount}
                  icon={CheckCircle}
                  accent="success"
                  loading={serviceLoading}
                />
                <KpiCard
                  label="Total"
                  value={serviceStats.totalCount}
                  icon={ChatsCircle}
                  accent="primary"
                  loading={serviceLoading}
                />
                <KpiCard
                  label="Tempo médio de resposta"
                  value={formatSeconds(serviceStats.avgResponseSeconds)}
                  icon={ClockClockwise}
                  accent="warning"
                  loading={serviceLoading}
                  mono
                  onClick={() => setServiceDetail('all')}
                />
              </div>
            </section>


            {/* Trend chart */}
            <Suspense fallback={<BlockFallback className="h-72" />}>
              <SalesTrendChart data={trend} formatCurrency={formatCurrency} loading={loading} />
            </Suspense>

            {/* Funnel + Distribution */}
            <Suspense fallback={<BlockFallback className="h-64" />}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PipelineFunnel
                  stages={funnel}
                  formatCurrency={formatCurrency}
                  loading={loading}
                />
                <StageDistribution
                  data={funnel.map((f) => ({ name: f.name, value: f.value }))}
                  formatCurrency={formatCurrency}
                  loading={loading}
                />
              </div>
            </Suspense>

            {/* Leaderboard */}
            <Suspense fallback={<BlockFallback className="h-64" />}>
              <UserLeaderboard
                rows={userStats}
                formatCurrency={formatCurrency}
                loading={loading}
                onRowClick={(r) => {
                  if (r.userId !== 'unassigned') setSelectedUser(r);
                }}
              />
            </Suspense>

            {selectedUser && organization && (
              <Suspense fallback={null}>
                <UserDetailDialog
                  open={!!selectedUser}
                  onOpenChange={(o) => !o && setSelectedUser(null)}
                  user={selectedUser}
                  organizationId={organization.id}
                  range={range}
                  formatCurrency={formatCurrency}
                  stagesById={Object.fromEntries(stages.map((s) => [s.id, s.name]))}
                />
              </Suspense>
            )}

            {serviceDetail && organization && (
              <ServiceResponseDetailDialog
                open={!!serviceDetail}
                onClose={() => setServiceDetail(null)}
                kind={serviceDetail}
                organizationId={organization.id}
                from={range.from}
                to={range.to}
                ownerId={ownerId}
              />
            )}
        </div>
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {detail === 'won' && 'Oportunidades ganhas'}
              {detail === 'lost' && 'Oportunidades perdidas'}
              {detail === 'created' && 'Oportunidades criadas'}
              {' — '}
              {detailCount}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto -mx-6 px-6">
            {detailLoading ? (
              <div className="space-y-2 py-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
                ))}
              </div>
            ) : detailRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Sem oportunidades no período.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {detailRows.map((o) => {
                  const dateLabel =
                    detail === 'created'
                      ? `Criada em ${new Date(o.created_at).toLocaleDateString(locale)}`
                      : `${detail === 'won' ? 'Ganha' : 'Fechada'} em ${parseLocalDate(o.close_date)?.toLocaleDateString(locale) ?? '—'}`;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDetail(null);
                          navigate(`/opportunities/${o.id}`);
                        }}
                        className="w-full flex items-center justify-between gap-4 py-3 text-left hover:bg-muted/50 px-2 rounded transition"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {o.contacts?.full_name || '(sem contato)'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {o.title || '(sem título)'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {dateLabel}
                            {` · Responsável: ${o.users?.full_name || '—'}`}
                          </p>
                        </div>

                        <span className="text-sm font-mono text-muted-foreground flex-shrink-0">
                          {formatCurrency(Number(o.amount) || 0)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>

  );
}
