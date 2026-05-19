import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { TrendUp, CheckCircle, ChartLineUp } from '@phosphor-icons/react';

const periods = [
  { value: '1', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

export function MobileDashboard() {
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');

  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);
  const [enteredCount, setEnteredCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);

  useEffect(() => {
    if (organization && userProfile) {
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, userProfile?.id, period]);

  async function fetchStats() {
    if (!organization || !userProfile) return;
    setLoading(true);
    try {
      const daysAgo = parseInt(period);
      const from = new Date();
      from.setDate(from.getDate() - (daysAgo - 1));
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);

      const fromIso = from.toISOString();
      const toIso = to.toISOString();
      const toDayStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const fromDay = toDayStr(from);
      const toDay = toDayStr(to);

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
          .gte('close_date', fromDay)
          .lte('close_date', toDay),
      ]);

      setEnteredCount(enteredRes.count || 0);
      setClosedCount(closedRes.count || 0);
    } catch (e) {
      console.error('Mobile dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const firstName = userProfile?.full_name?.split(' ')[0] || '';
  const conversion = enteredCount > 0 ? (closedCount / enteredCount) * 100 : null;

  const kpis = [
    { label: t('dashboard.entered'), value: enteredCount.toString(), icon: TrendUp, color: 'text-primary' },
    { label: t('dashboard.closed'), value: closedCount.toString(), icon: CheckCircle, color: 'text-success' },
    {
      label: t('dashboard.conversion'),
      value: conversion === null ? '—' : `${conversion.toFixed(1)}%`,
      icon: ChartLineUp,
      color: 'text-primary',
    },
  ];

  return (
    <div className="px-4 py-5 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Olá, {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Aqui está o resumo do seu CRM
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors border',
              period === p.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/40'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between p-4 rounded-md border border-border bg-card',
              loading && 'animate-pulse'
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={cn('text-2xl font-semibold mt-0.5 truncate', kpi.color)}>
                {loading ? '—' : kpi.value}
              </p>
            </div>
            <kpi.icon size={28} weight="light" className={cn(kpi.color, 'opacity-60 flex-shrink-0')} />
          </div>
        ))}
      </div>
    </div>
  );
}
