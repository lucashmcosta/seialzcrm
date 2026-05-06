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
import {
  ReportFilters,
  computeRange,
  type PeriodPreset,
} from '@/components/reports/ReportFilters';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { organization, userProfile, locale, loading: orgLoading, error } = useOrganization();
  const { user, signOut } = useAuth();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [preset, setPreset] = useState<PeriodPreset>('last_30');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const [enteredCount, setEnteredCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);
  const [loading, setLoading] = useState(true);

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
  }, [organization?.id, userProfile?.id, from.getTime(), to.getTime()]);

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

      const [enteredRes, closedRes] = await Promise.all([
        supabase
          .from('opportunities')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organization.id)
          .eq('owner_user_id', userProfile.id)
          .is('deleted_at', null)
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
        supabase
          .from('opportunities')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organization.id)
          .eq('owner_user_id', userProfile.id)
          .eq('status', 'won')
          .is('deleted_at', null)
          .gte('updated_at', fromIso)
          .lte('updated_at', toIso),
      ]);

      setEnteredCount(enteredRes.count || 0);
      setClosedCount(closedRes.count || 0);
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const conversion = enteredCount > 0 ? (closedCount / enteredCount) * 100 : null;

  const kpis = [
    {
      label: t('dashboard.entered'),
      value: enteredCount.toString(),
      icon: TrendUp,
      color: 'text-primary',
    },
    {
      label: t('dashboard.closed'),
      value: closedCount.toString(),
      icon: CheckCircle,
      color: 'text-success',
    },
    {
      label: t('dashboard.conversion'),
      value: conversion === null ? '—' : `${conversion.toFixed(1)}%`,
      icon: ChartLineUp,
      color: 'text-primary',
    },
  ];

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
            showOwner={false}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {kpis.map((kpi, i) => (
              <Card key={i} className={cn('p-6', loading && 'animate-pulse')}>
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
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
