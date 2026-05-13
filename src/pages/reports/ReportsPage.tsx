import { useEffect, useMemo, useState, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
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
} from '@phosphor-icons/react';
import { SalesTrendChart, type TrendPoint } from '@/components/reports/SalesTrendChart';
import { PipelineFunnel, type FunnelStage } from '@/components/reports/PipelineFunnel';
import { UserLeaderboard, type UserStats } from '@/components/reports/UserLeaderboard';
import { KpiCard } from '@/components/reports/KpiCard';
import { WinRateGauge } from '@/components/reports/WinRateGauge';
import { StageDistribution } from '@/components/reports/StageDistribution';
import UserDetailDialog from '@/components/reports/UserDetailDialog';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { computeRange, type PeriodPreset, type CustomRange } from '@/lib/report-period';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { MobileReports } from '@/components/mobile/MobileReports';

const BlockFallback = ({ className = 'h-32' }: { className?: string }) => (
  <div className={`animate-pulse rounded-md bg-muted/50 ${className}`} />
);

interface Opp {
  id: string;
  amount: number | null;
  status: string;
  pipeline_stage_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
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

export default function ReportsPage() {
  const { organization, locale } = useOrganization();
  const { permissions, loading: permsLoading } = usePermissions();
  const isMobile = useIsMobile();

  const [preset, setPreset] = useState<PeriodPreset>('last_30');
  const [customRange, setCustomRange] = useState<CustomRange | undefined>();
  const [ownerId, setOwnerId] = useState('all');

  const range = useMemo(() => computeRange(preset, customRange), [preset, customRange]);
  const rangeKey = `${range.from.toISOString()}_${range.to.toISOString()}`;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [currentOpps, setCurrentOpps] = useState<Opp[]>([]);
  const [previousOpps, setPreviousOpps] = useState<Opp[]>([]);
  const [openOpps, setOpenOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(null);

  useEffect(() => {
    if (!organization) return;
    fetchUsersAndStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  useEffect(() => {
    if (!organization) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, rangeKey, ownerId]);

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

  async function fetchData() {
    if (!organization) return;
    setLoading(true);

    const fromDate = range.from;
    const toDate = range.to;
    const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));
    const prevFrom = new Date(fromDate);
    prevFrom.setDate(prevFrom.getDate() - days);
    const prevTo = new Date(fromDate);

    try {
      // Build base queries
      const ownerEq = ownerId !== 'all' ? ownerId : null;

      const baseSelect = 'id, amount, status, pipeline_stage_id, owner_user_id, created_at, updated_at';

      // Current period: opps created OR closed within period
      let q1 = supabase
        .from('opportunities')
        .select(baseSelect)
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .or(
          `and(created_at.gte.${fromDate.toISOString()},created_at.lte.${toDate.toISOString()}),and(status.in.(won,lost),updated_at.gte.${fromDate.toISOString()},updated_at.lte.${toDate.toISOString()})`,
        );
      if (ownerEq) q1 = q1.eq('owner_user_id', ownerEq);

      // Previous period (for delta)
      let q2 = supabase
        .from('opportunities')
        .select(baseSelect)
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .or(
          `and(created_at.gte.${prevFrom.toISOString()},created_at.lt.${prevTo.toISOString()}),and(status.in.(won,lost),updated_at.gte.${prevFrom.toISOString()},updated_at.lt.${prevTo.toISOString()})`,
        );
      if (ownerEq) q2 = q2.eq('owner_user_id', ownerEq);

      // All currently open (independent of period — for funnel/distribution)
      let q3 = supabase
        .from('opportunities')
        .select(baseSelect)
        .eq('organization_id', organization.id)
        .eq('status', 'open')
        .is('deleted_at', null);
      if (ownerEq) q3 = q3.eq('owner_user_id', ownerEq);

      const [r1, r2, r3] = await Promise.all([q1, q2, q3]);

      setCurrentOpps((r1.data as Opp[]) || []);
      setPreviousOpps((r2.data as Opp[]) || []);
      setOpenOpps((r3.data as Opp[]) || []);
    } catch (e) {
      console.error('Reports fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: organization?.default_currency || 'BRL',
      maximumFractionDigits: 0,
    }).format(n || 0);

  // ─────────────────────────────────────────
  // Compute KPIs
  // ─────────────────────────────────────────
  const stats = useMemo(() => {
    const fromDate = range.from;
    const toDate = range.to;
    const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));

    const inPeriodCreated = (o: Opp) => {
      const t = new Date(o.created_at);
      return t >= fromDate && t <= toDate;
    };
    const inPeriodClosed = (o: Opp) => {
      const t = new Date(o.updated_at);
      return (o.status === 'won' || o.status === 'lost') && t >= fromDate && t <= toDate;
    };

    const created = currentOpps.filter(inPeriodCreated);
    const won = currentOpps.filter((o) => o.status === 'won' && inPeriodClosed(o));
    const lost = currentOpps.filter((o) => o.status === 'lost' && inPeriodClosed(o));

    const wonValue = won.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const lostValue = lost.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const winRate =
      won.length + lost.length > 0
        ? (won.length / (won.length + lost.length)) * 100
        : 0;
    const avgTicket = won.length > 0 ? wonValue / won.length : 0;

    const cycleDaysList = won
      .map((o) => {
        const c = new Date(o.created_at).getTime();
        const u = new Date(o.updated_at).getTime();
        return Math.max(0, (u - c) / 86400000);
      })
      .filter((d) => isFinite(d));
    const avgCycle =
      cycleDaysList.length > 0
        ? cycleDaysList.reduce((a, b) => a + b, 0) / cycleDaysList.length
        : 0;

    // Previous period
    const prevFrom = new Date(fromDate);
    prevFrom.setDate(prevFrom.getDate() - days);
    const prevTo = new Date(fromDate);
    const inPrevCreated = (o: Opp) => {
      const t = new Date(o.created_at);
      return t >= prevFrom && t < prevTo;
    };
    const inPrevClosed = (o: Opp) => {
      const t = new Date(o.updated_at);
      return (
        (o.status === 'won' || o.status === 'lost') && t >= prevFrom && t < prevTo
      );
    };
    const prevCreated = previousOpps.filter(inPrevCreated);
    const prevWon = previousOpps.filter(
      (o) => o.status === 'won' && inPrevClosed(o),
    );
    const prevLost = previousOpps.filter(
      (o) => o.status === 'lost' && inPrevClosed(o),
    );
    const prevWonValue = prevWon.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const prevWinRate =
      prevWon.length + prevLost.length > 0
        ? (prevWon.length / (prevWon.length + prevLost.length)) * 100
        : 0;

    const delta = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return ((curr - prev) / prev) * 100;
    };

    return {
      createdCount: created.length,
      createdDelta: delta(created.length, prevCreated.length),
      wonCount: won.length,
      wonValue,
      wonValueDelta: delta(wonValue, prevWonValue),
      lostCount: lost.length,
      lostValue,
      winRate,
      winRateDelta: delta(winRate, prevWinRate),
      avgTicket,
      avgCycle,
    };
  }, [currentOpps, previousOpps, rangeKey]);

  // Funnel & distribution
  const funnel: FunnelStage[] = useMemo(() => {
    return stages.map((s) => {
      const items = openOpps.filter((o) => o.pipeline_stage_id === s.id);
      return {
        name: s.name,
        count: items.length,
        value: items.reduce((acc, o) => acc + (Number(o.amount) || 0), 0),
      };
    });
  }, [stages, openOpps]);

  // Trend
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

    currentOpps.forEach((o) => {
      const created = new Date(o.created_at);
      if (created >= fromDate && created <= toDate) {
        const idx = points.findIndex((p) => p.date === matchKey(created));
        if (idx >= 0) points[idx].created += 1;
      }

      if (o.status === 'won') {
        const closed = new Date(o.updated_at);
        if (closed >= fromDate && closed <= toDate) {
          const i = points.findIndex((p) => p.date === matchKey(closed));
          if (i >= 0) {
            points[i].won += 1;
            points[i].wonValue += Number(o.amount) || 0;
          }
        }
      }
    });

    return points;
  }, [currentOpps, rangeKey, locale]);

  // Per-user stats
  const userStats: UserStats[] = useMemo(() => {
    const map = new Map<string, UserStats>();
    const fromDate = range.from;
    const toDate = range.to;

    const ensure = (uid: string) => {
      if (!map.has(uid)) {
        const u = users.find((x) => x.id === uid);
        map.set(uid, {
          userId: uid,
          fullName: u?.full_name || 'Sem responsável',
          open: 0,
          won: 0,
          lost: 0,
          wonValue: 0,
        });
      }
      return map.get(uid)!;
    };

    openOpps.forEach((o) => {
      const uid = o.owner_user_id || 'unassigned';
      ensure(uid).open += 1;
    });

    currentOpps.forEach((o) => {
      const t = new Date(o.updated_at);
      if ((o.status === 'won' || o.status === 'lost') && t >= fromDate && t <= toDate) {
        const uid = o.owner_user_id || 'unassigned';
        const row = ensure(uid);
        if (o.status === 'won') {
          row.won += 1;
          row.wonValue += Number(o.amount) || 0;
        } else {
          row.lost += 1;
        }
      }
    });

    return Array.from(map.values()).filter(
      (r) => r.open > 0 || r.won > 0 || r.lost > 0,
    );
  }, [openOpps, currentOpps, users, rangeKey]);

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
          openCount={openOpps.length}
          openValue={openOpps.reduce((s, o) => s + (Number(o.amount) || 0), 0)}
          trend={trend}
          funnel={funnel}
          userStats={userStats}
          formatCurrency={formatCurrency}
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
              <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
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
                  accent="primary"
                  loading={loading}
                />
                <KpiCard
                  label="Ganhas"
                  value={stats.wonCount}
                  sublabel={formatCurrency(stats.wonValue)}
                  delta={stats.wonValueDelta}
                  icon={CheckCircle}
                  accent="success"
                  loading={loading}
                />
                <KpiCard
                  label="Perdidas"
                  value={stats.lostCount}
                  sublabel={formatCurrency(stats.lostValue)}
                  icon={XCircle}
                  accent="destructive"
                  loading={loading}
                />
                <KpiCard
                  label="Win Rate"
                  value={`${stats.winRate.toFixed(1)}%`}
                  delta={stats.winRateDelta}
                  icon={Target}
                  accent="warning"
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
                  lostCount={stats.lostCount}
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
                    value={openOpps.length}
                    icon={Briefcase}
                    accent="primary"
                    loading={loading}
                  />
                  <KpiCard
                    label="Pipeline aberto (valor)"
                    value={formatCurrency(
                      openOpps.reduce((s, o) => s + (Number(o.amount) || 0), 0),
                    )}
                    icon={Trophy}
                    accent="warning"
                    loading={loading}
                    mono
                  />
                </div>
              </div>
            </Suspense>

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
        </div>
      </div>
    </Layout>
  );
}
