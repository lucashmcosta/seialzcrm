import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { TrendUp, CheckCircle, ChartLineUp } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { MobileDashboard } from '@/components/mobile/MobileDashboard';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { computeRange, type PeriodPreset, type CustomRange } from '@/lib/report-period';
import { DashboardTrendChart } from '@/components/reports/DashboardTrendChart';
import { DashboardStatusDonut } from '@/components/reports/DashboardStatusDonut';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { usePermissions } from '@/hooks/usePermissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { cn } from '@/lib/utils';
interface OppRow {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  close_date: string | null;
  amount: number | null;
}

/** Parse YYYY-MM-DD as LOCAL midnight (close_date is a DATE column). */
const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const toDayStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const { organization, userProfile, locale, loading: orgLoading, error } = useOrganization();
  const { user, signOut } = useAuth();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { permissions } = usePermissions();
  const canViewAll = !!permissions?.viewAllOpportunities;

  const [preset, setPreset] = usePersistedFilters<PeriodPreset>('dashboard.preset', 'today');
  const [customRange, setCustomRange] = usePersistedFilters<CustomRange | undefined>(
    'dashboard.custom',
    undefined,
    (raw) => {
      if (!raw || typeof raw !== 'object') return undefined;
      return {
        from: raw.from ? new Date(raw.from) : undefined,
        to: raw.to ? new Date(raw.to) : undefined,
      };
    },
  );
  const [ownerId, setOwnerId] = usePersistedFilters<string>('dashboard.ownerId', 'all');

  const [enteredCount, setEnteredCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<null | 'entered' | 'closed'>(null);

  const { from, to } = computeRange(preset, customRange);

  useEffect(() => {
    if (!orgLoading && !user) {
      navigate('/auth/signin', { replace: true });
    }
  }, [orgLoading, user, navigate]);

  useEffect(() => {
    if (organization && userProfile) {
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, userProfile?.id, from.getTime(), to.getTime(), canViewAll, ownerId]);

  useEffect(() => {
    if (!organization || !canViewAll) {
      setUsers([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('user_organizations')
        .select('user_id, users(id, full_name)')
        .eq('organization_id', organization.id)
        .eq('is_active', true);
      if (data) {
        setUsers(
          data
            .filter((r: any) => r.users)
            .map((r: any) => ({ id: r.users.id, full_name: r.users.full_name }))
            .sort((a, b) => a.full_name.localeCompare(b.full_name)),
        );
      }
    })();
  }, [organization?.id, canViewAll]);

  if (isMobile) {
    if (orgLoading) {
      return (
        <MobileLayout>
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-md animate-pulse" />
            ))}
          </div>
        </MobileLayout>
      );
    }
    if (!user) return null;
    return (
      <MobileLayout>
        <MobileDashboard />
      </MobileLayout>
    );
  }

  if (orgLoading) {
    return (
      <Layout>
        <div className="flex flex-col h-full">
          <div className="border-b bg-background/95 backdrop-blur">
            <div className="px-6 py-4">
              <div className="h-8 w-48 bg-muted rounded animate-pulse" />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="h-10 w-64 bg-muted rounded animate-pulse mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-md animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) return null;

  if (error || !userProfile) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full p-6">
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-2xl font-bold text-foreground">Erro ao carregar perfil</h2>
            <p className="text-muted-foreground">
              Não foi possível carregar seus dados. Tente recarregar a página.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => window.location.reload()}>Recarregar</Button>
              <Button variant="outline" onClick={() => signOut()}>Sair</Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!organization) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full p-6">
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-2xl font-bold text-foreground">Sem organização</h2>
            <p className="text-muted-foreground">
              Você ainda não está vinculado a uma organização. Complete o onboarding para começar.
            </p>
            <Button onClick={() => navigate('/onboarding')}>Ir para Onboarding</Button>
          </div>
        </div>
      </Layout>
    );
  }

  async function fetchStats() {
    if (!organization || !userProfile) return;
    setLoading(true);
    try {
      const fromIso = from.toISOString();
      const toIso = to.toISOString();
      const fromDay = toDayStr(from);
      const toDay = toDayStr(to);

      // Single query: rows created in period OR won-and-closed (by close_date) in period
      let query = supabase
        .from('opportunities')
        .select('id, title, status, created_at, updated_at, close_date, amount')
        .eq('organization_id', organization.id)
        .is('deleted_at', null);

      // Owner scoping: admins (viewAllOpportunities) can pick a user or 'all'.
      // Everyone else is limited to their own opportunities.
      if (!canViewAll) {
        query = query.eq('owner_user_id', userProfile.id);
      } else if (ownerId && ownerId !== 'all') {
        query = query.eq('owner_user_id', ownerId);
      }

      const { data, error } = await query
        .or(
          `and(created_at.gte.${fromIso},created_at.lte.${toIso}),and(status.eq.won,close_date.gte.${fromDay},close_date.lte.${toDay})`,
        )
        .limit(5000);

      if (error) throw error;
      const rows = (data || []) as OppRow[];

      const fromMs = from.getTime();
      const toMs = to.getTime();
      let entered = 0;
      let closed = 0;
      for (const r of rows) {
        const c = new Date(r.created_at).getTime();
        if (c >= fromMs && c <= toMs) entered += 1;
        if (r.status === 'won' && r.close_date) {
          const d = parseLocalDate(r.close_date);
          if (d) {
            const u = d.getTime();
            if (u >= fromMs && u <= toMs) closed += 1;
          }
        }
      }

      setEnteredCount(entered);
      setClosedCount(closed);
      setOpps(rows);
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const conversion = enteredCount > 0 ? (closedCount / enteredCount) * 100 : null;

  const kpis = [
    {
      key: 'entered' as const,
      label: t('dashboard.entered'),
      value: enteredCount.toString(),
      icon: TrendUp,
      color: 'text-primary',
      clickable: true,
    },
    {
      key: 'closed' as const,
      label: t('dashboard.closed'),
      value: closedCount.toString(),
      icon: CheckCircle,
      color: 'text-success',
      clickable: true,
    },
    {
      key: 'conversion' as const,
      label: t('dashboard.conversion'),
      value: conversion === null ? '—' : `${conversion.toFixed(1)}%`,
      icon: ChartLineUp,
      color: 'text-primary',
      clickable: false,
    },
  ];

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const enteredOpps = opps.filter((o) => {
    const c = new Date(o.created_at).getTime();
    return c >= fromMs && c <= toMs;
  });
  const closedOpps = opps.filter((o) => {
    if (o.status !== 'won' || !o.close_date) return false;
    const d = parseLocalDate(o.close_date);
    if (!d) return false;
    const u = d.getTime();
    return u >= fromMs && u <= toMs;
  });
  const detailRows = detail === 'entered' ? enteredOpps : detail === 'closed' ? closedOpps : [];
  const detailTitle =
    detail === 'entered' ? t('dashboard.entered') : detail === 'closed' ? t('dashboard.closed') : '';

  const fmtMoney = (v: number | null) =>
    v == null ? '—' : v.toLocaleString(locale === 'en-US' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  const fmtDate = (s: string | null, local = false) => {
    if (!s) return '—';
    const d = local ? parseLocalDate(s) : new Date(s);
    return d ? d.toLocaleDateString(locale === 'en-US' ? 'en-US' : 'pt-BR') : '—';
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('dashboard.welcome')}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <ReportFilters
            preset={preset}
            onPresetChange={setPreset}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            ownerId={canViewAll ? ownerId : undefined}
            onOwnerChange={canViewAll ? setOwnerId : undefined}
            users={users}
            showOwner={canViewAll}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {kpis.map((kpi) => {
              const interactive = kpi.clickable && !loading;
              return (
                <Card
                  key={kpi.key}
                  onClick={interactive ? () => setDetail(kpi.key as 'entered' | 'closed') : undefined}
                  className={cn(
                    'p-6 transition',
                    loading && 'animate-pulse',
                    interactive && 'cursor-pointer hover:border-primary/40 hover:shadow-sm',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">{kpi.label}</p>
                      <p className={cn('text-3xl font-semibold mt-2', kpi.color)}>
                        {loading ? '—' : kpi.value}
                      </p>
                    </div>
                    <kpi.icon size={32} weight="light" className={cn(kpi.color, 'opacity-60 flex-shrink-0')} />
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <DashboardTrendChart data={opps} from={from} to={to} loading={loading} />
            </div>
            <div className="lg:col-span-1">
              <DashboardStatusDonut data={opps} from={from} to={to} loading={loading} />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {detailTitle} — {detailRows.length}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto -mx-6 px-6">
            {detailRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Sem oportunidades no período.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {detailRows.map((o) => (
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
                          {o.title || '(sem título)'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {detail === 'closed'
                            ? `Fechada em ${fmtDate(o.close_date, true)}`
                            : `Criada em ${fmtDate(o.created_at)}`}
                        </p>
                      </div>
                      <span className="text-sm font-mono text-muted-foreground flex-shrink-0">
                        {fmtMoney(o.amount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
