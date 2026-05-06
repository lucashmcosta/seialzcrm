import { useEffect, useMemo, useState } from 'react';
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
import { KpiCard } from '@/components/reports/KpiCard';
import { WinRateGauge } from '@/components/reports/WinRateGauge';
import {
  SalesTrendChart,
  type TrendPoint,
} from '@/components/reports/SalesTrendChart';
import {
  PipelineFunnel,
  type FunnelStage,
} from '@/components/reports/PipelineFunnel';
import { StageDistribution } from '@/components/reports/StageDistribution';
import {
  UserLeaderboard,
  type UserStats,
} from '@/components/reports/UserLeaderboard';
import {
  ReportFilters,
  computeRange,
  type PeriodPreset,
} from '@/components/reports/ReportFilters';
import type { DateRange } from 'react-day-picker';

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

  const [period, setPeriod] = useState('30');
  const [ownerId, setOwnerId] = useState('all');

  const [preset, setPreset] = useState<PeriodPreset>('last_30');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [ownerId, setOwnerId] = useState('all');

  const range = useMemo(() => computeRange(preset, customRange), [preset, customRange]);
  const rangeKey = `${range.from.toISOString()}_${range.to.toISOString()}`;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [currentOpps, setCurrentOpps] = useState<Opp[]>([]);
  const [previousOpps, setPreviousOpps] = useState<Opp[]>([]);
  const [openOpps, setOpenOpps] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);

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

    const days = parseInt(period);
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
    const prevFrom = new Date(fromDate);
    prevFrom.setDate(prevFrom.getDate() - days);

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
          `created_at.gte.${fromDate.toISOString()},and(status.in.(won,lost),updated_at.gte.${fromDate.toISOString()})`,
        );
      if (ownerEq) q1 = q1.eq('owner_user_id', ownerEq);

      // Previous period (for delta)
      let q2 = supabase
        .from('opportunities')
        .select(baseSelect)
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .or(
          `and(created_at.gte.${prevFrom.toISOString()},created_at.lt.${fromDate.toISOString()}),and(status.in.(won,lost),updated_at.gte.${prevFrom.toISOString()},updated_at.lt.${fromDate.toISOString()})`,
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
    const days = parseInt(period);
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);

    const inPeriodCreated = (o: Opp) => new Date(o.created_at) >= fromDate;
    const inPeriodClosed = (o: Opp) =>
      (o.status === 'won' || o.status === 'lost') &&
      new Date(o.updated_at) >= fromDate;

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

    // Avg sales cycle (days)
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
    const prevDate = new Date(fromDate);
    prevDate.setDate(prevDate.getDate() - days);
    const inPrevCreated = (o: Opp) => {
      const t = new Date(o.created_at);
      return t >= prevDate && t < fromDate;
    };
    const inPrevClosed = (o: Opp) => {
      const t = new Date(o.updated_at);
      return (
        (o.status === 'won' || o.status === 'lost') && t >= prevDate && t < fromDate
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
  }, [currentOpps, previousOpps, period]);

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
    const days = parseInt(period);
    const now = new Date();
    const buckets = days <= 1 ? 1 : days <= 7 ? days : days <= 30 ? 30 : days <= 90 ? 90 : 12;
    const isMonthly = days > 90;
    const points: TrendPoint[] = [];

    for (let i = buckets - 1; i >= 0; i--) {
      const d = new Date(now);
      if (isMonthly) {
        d.setMonth(d.getMonth() - i);
        d.setDate(1);
      } else {
        d.setDate(d.getDate() - i);
      }
      const key = isMonthly
        ? d.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
        : d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
      points.push({ date: key, created: 0, won: 0, wonValue: 0 });
    }

    const matchKey = (date: Date) =>
      isMonthly
        ? date.toLocaleDateString(locale, { month: 'short', year: '2-digit' })
        : date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

    currentOpps.forEach((o) => {
      const created = new Date(o.created_at);
      const idx = points.findIndex((p) => p.date === matchKey(created));
      if (idx >= 0) points[idx].created += 1;

      if (o.status === 'won') {
        const closed = new Date(o.updated_at);
        const i = points.findIndex((p) => p.date === matchKey(closed));
        if (i >= 0) {
          points[i].won += 1;
          points[i].wonValue += Number(o.amount) || 0;
        }
      }
    });

    return points;
  }, [currentOpps, period, locale]);

  // Per-user stats
  const userStats: UserStats[] = useMemo(() => {
    const map = new Map<string, UserStats>();
    const days = parseInt(period);
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);

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
      if ((o.status === 'won' || o.status === 'lost') && new Date(o.updated_at) >= fromDate) {
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
  }, [openOpps, currentOpps, users, period]);

  // Permission gate (after hooks to satisfy Rules of Hooks)
  if (!permsLoading && !permissions.canManageSettings) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-border bg-background/95 backdrop-blur">
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
        <div className="flex-1 overflow-auto">
          <div className="space-y-6 p-6">
            {/* Filters */}
            <ReportFilters
              period={period}
              onPeriodChange={setPeriod}
              ownerId={ownerId}
              onOwnerChange={setOwnerId}
              users={users}
            />

            {/* KPI row */}
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

            {/* Win rate gauge + secondary KPIs */}
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

            {/* Trend chart */}
            <SalesTrendChart data={trend} formatCurrency={formatCurrency} loading={loading} />

            {/* Funnel + Distribution */}
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

            {/* Leaderboard */}
            <UserLeaderboard
              rows={userStats}
              formatCurrency={formatCurrency}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
