import { lazy, Suspense } from 'react';
import {
  Briefcase,
  CheckCircle,
  XCircle,
  Target,
  CurrencyDollar,
  Clock,
  Trophy,
  ChartLineUp,
} from '@phosphor-icons/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PeriodPreset, CustomRange } from '@/lib/report-period';
import type { TrendPoint } from '@/components/reports/SalesTrendChart';
import type { FunnelStage } from '@/components/reports/PipelineFunnel';
import type { UserStats } from '@/components/reports/UserLeaderboard';

const SalesTrendChart = lazy(() =>
  import('@/components/reports/SalesTrendChart').then((m) => ({ default: m.SalesTrendChart })),
);
const PipelineFunnel = lazy(() =>
  import('@/components/reports/PipelineFunnel').then((m) => ({ default: m.PipelineFunnel })),
);
const StageDistribution = lazy(() =>
  import('@/components/reports/StageDistribution').then((m) => ({ default: m.StageDistribution })),
);

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'this_week', label: 'Esta semana' },
  { value: 'last_week', label: 'Semana passada' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'last_7', label: 'Últimos 7 dias' },
  { value: 'last_30', label: 'Últimos 30 dias' },
  { value: 'last_90', label: 'Últimos 90 dias' },
  { value: 'last_365', label: 'Últimos 12 meses' },
];

const Block = ({ h = 'h-32' }: { h?: string }) => (
  <div className={`animate-pulse rounded-md bg-muted/50 ${h}`} />
);

interface KpiProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: any;
  accent?: 'primary' | 'success' | 'destructive' | 'warning';
}
function MiniKpi({ label, value, sublabel, icon: Icon, accent = 'primary' }: KpiProps) {
  const accentMap: Record<string, string> = {
    primary: 'text-primary bg-primary/10',
    success: 'text-emerald-500 bg-emerald-500/10',
    destructive: 'text-destructive bg-destructive/10',
    warning: 'text-amber-500 bg-amber-500/10',
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${accentMap[accent]}`}>
          <Icon size={14} weight="duotone" />
        </div>
      </div>
      <div className="text-lg font-semibold text-foreground leading-tight">{value}</div>
      {sublabel && <div className="text-[11px] text-muted-foreground truncate">{sublabel}</div>}
    </div>
  );
}

export interface MobileReportsProps {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  customRange?: CustomRange;
  onCustomRangeChange: (r: CustomRange | undefined) => void;
  ownerId: string;
  onOwnerChange: (v: string) => void;
  users: { id: string; full_name: string }[];
  loading: boolean;
  stats: {
    createdCount: number;
    wonCount: number;
    wonValue: number;
    lostCount: number;
    lostValue: number;
    winRate: number;
    avgTicket: number;
    avgCycle: number;
  };
  openCount: number;
  openValue: number;
  trend: TrendPoint[];
  funnel: FunnelStage[];
  userStats: UserStats[];
  formatCurrency: (n: number) => string;
}

export function MobileReports(props: MobileReportsProps) {
  const {
    preset,
    onPresetChange,
    ownerId,
    onOwnerChange,
    users,
    loading,
    stats,
    openCount,
    openValue,
    trend,
    funnel,
    userStats,
    formatCurrency,
  } = props;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
          <ChartLineUp size={18} weight="duotone" className="text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 grid grid-cols-2 gap-2">
        <Select value={preset} onValueChange={(v) => onPresetChange(v as PeriodPreset)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerId} onValueChange={onOwnerChange}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos os responsáveis</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id} className="text-xs">
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI grid */}
      <div className="px-4 py-2 grid grid-cols-2 gap-2">
        <MiniKpi label="Criadas" value={loading ? '—' : stats.createdCount} icon={Briefcase} accent="primary" />
        <MiniKpi
          label="Ganhas"
          value={loading ? '—' : stats.wonCount}
          sublabel={loading ? undefined : formatCurrency(stats.wonValue)}
          icon={CheckCircle}
          accent="success"
        />
        <MiniKpi
          label="Perdidas"
          value={loading ? '—' : stats.lostCount}
          sublabel={loading ? undefined : formatCurrency(stats.lostValue)}
          icon={XCircle}
          accent="destructive"
        />
        <MiniKpi
          label="Win Rate"
          value={loading ? '—' : `${stats.winRate.toFixed(1)}%`}
          icon={Target}
          accent="warning"
        />
        <MiniKpi
          label="Ticket médio"
          value={loading ? '—' : formatCurrency(stats.avgTicket)}
          icon={CurrencyDollar}
          accent="success"
        />
        <MiniKpi
          label="Ciclo médio"
          value={loading ? '—' : `${stats.avgCycle.toFixed(0)}d`}
          icon={Clock}
          accent="primary"
        />
        <MiniKpi
          label="Pipeline (qtd)"
          value={loading ? '—' : openCount}
          icon={Briefcase}
          accent="primary"
        />
        <MiniKpi
          label="Pipeline (valor)"
          value={loading ? '—' : formatCurrency(openValue)}
          icon={Trophy}
          accent="warning"
        />
      </div>

      {/* Trend chart */}
      <div className="px-4 py-2">
        <Suspense fallback={<Block h="h-64" />}>
          <SalesTrendChart data={trend} formatCurrency={formatCurrency} loading={loading} />
        </Suspense>
      </div>

      {/* Funnel */}
      <div className="px-4 py-2">
        <Suspense fallback={<Block h="h-64" />}>
          <PipelineFunnel stages={funnel} formatCurrency={formatCurrency} loading={loading} />
        </Suspense>
      </div>

      {/* Distribution */}
      <div className="px-4 py-2">
        <Suspense fallback={<Block h="h-64" />}>
          <StageDistribution
            data={funnel.map((f) => ({ name: f.name, value: f.value }))}
            formatCurrency={formatCurrency}
            loading={loading}
          />
        </Suspense>
      </div>

      {/* Leaderboard (compact list) */}
      <div className="px-4 py-2 pb-6">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Ranking de vendedores</h3>
          </div>
          {loading ? (
            <div className="p-3 space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />)}
            </div>
          ) : userStats.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Sem dados no período</div>
          ) : (
            <ul className="divide-y divide-border">
              {[...userStats]
                .sort((a, b) => b.wonValue - a.wonValue)
                .map((u, idx) => (
                  <li key={u.userId} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-5 text-xs font-mono text-muted-foreground">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {u.won} ganhas · {u.lost} perdidas · {u.open} abertas
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(u.wonValue)}</p>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
