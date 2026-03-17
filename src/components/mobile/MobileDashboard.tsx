import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  CurrencyDollar,
  TrendUp,
  TrendDown,
  UsersThree,
  CheckCircle,
  CaretRight,
} from '@phosphor-icons/react';

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

  const [openOpportunities, setOpenOpportunities] = useState(0);
  const [pipelineValue, setPipelineValue] = useState(0);
  const [wonAmount, setWonAmount] = useState(0);
  const [lostCount, setLostCount] = useState(0);
  const [newContacts, setNewContacts] = useState(0);
  const [myTasks, setMyTasks] = useState<any[]>([]);

  useEffect(() => {
    if (organization && userProfile) {
      fetchStats();
    }
  }, [organization?.id, userProfile?.id, period]);

  async function fetchStats() {
    if (!organization || !userProfile) return;
    setLoading(true);

    try {
      const daysAgo = parseInt(period);
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - daysAgo);

      // Open opportunities
      const { count: openCount, data: openOpps } = await supabase
        .from('opportunities')
        .select('amount', { count: 'exact' })
        .eq('organization_id', organization.id)
        .eq('status', 'open')
        .is('deleted_at', null);

      setOpenOpportunities(openCount || 0);
      const totalValue = (openOpps || []).reduce((sum, opp) => sum + (opp.amount || 0), 0);
      setPipelineValue(totalValue);

      // Won
      const { data: wonOpps } = await supabase
        .from('opportunities')
        .select('amount')
        .eq('organization_id', organization.id)
        .eq('status', 'won')
        .gte('updated_at', dateFilter.toISOString())
        .is('deleted_at', null);
      setWonAmount((wonOpps || []).reduce((sum, opp) => sum + (opp.amount || 0), 0));

      // Lost
      const { count: lc } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'lost')
        .gte('updated_at', dateFilter.toISOString())
        .is('deleted_at', null);
      setLostCount(lc || 0);

      // New contacts
      const { count: cc } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .gte('created_at', dateFilter.toISOString())
        .is('deleted_at', null);
      setNewContacts(cc || 0);

      // Tasks
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, due_at, priority, contact_id, contacts(full_name)')
        .eq('organization_id', organization.id)
        .eq('assigned_user_id', userProfile.id)
        .eq('status', 'open')
        .lte('due_at', today.toISOString())
        .is('deleted_at', null)
        .order('due_at', { ascending: true })
        .limit(5);
      setMyTasks(tasks || []);
    } catch (e) {
      console.error('Mobile dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: organization?.default_currency || 'BRL',
    }).format(value);

  const firstName = userProfile?.full_name?.split(' ')[0] || '';

  const kpis = [
    {
      label: t('dashboard.openOpportunities'),
      value: openOpportunities.toString(),
      icon: CurrencyDollar,
      color: 'text-primary',
    },
    {
      label: t('dashboard.pipelineValue'),
      value: formatCurrency(pipelineValue),
      icon: TrendUp,
      color: 'text-primary',
      mono: true,
    },
    {
      label: t('dashboard.wonAmount'),
      value: formatCurrency(wonAmount),
      icon: CheckCircle,
      color: 'text-success',
      mono: true,
    },
    {
      label: t('dashboard.lostOpportunities'),
      value: lostCount.toString(),
      icon: TrendDown,
      color: 'text-destructive',
    },
    {
      label: t('dashboard.newContacts'),
      value: newContacts.toString(),
      icon: UsersThree,
      color: 'text-primary',
    },
  ];

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Olá, {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Aqui está o resumo do seu CRM
        </p>
      </div>

      {/* Period filter chips */}
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

      {/* KPI Cards */}
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
              <p
                className={cn(
                  'text-lg font-semibold mt-0.5 truncate',
                  kpi.color,
                  kpi.mono && 'font-mono'
                )}
              >
                {loading ? '—' : kpi.value}
              </p>
            </div>
            <kpi.icon size={28} weight="light" className={cn(kpi.color, 'opacity-60 flex-shrink-0')} />
          </div>
        ))}
      </div>

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            {t('dashboard.myTasksToday')}
          </h2>
          <Link to="/tasks" className="text-xs text-primary font-medium flex items-center gap-0.5">
            Ver todas <CaretRight size={12} weight="bold" />
          </Link>
        </div>

        {myTasks.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('dashboard.noTasks')}
          </p>
        ) : (
          <div className="space-y-2">
            {myTasks.map((task) => (
              <Link
                key={task.id}
                to="/tasks"
                className="flex items-center gap-3 p-3 rounded-md border border-border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  {task.contacts && (
                    <p className="text-xs text-muted-foreground truncate">{task.contacts.full_name}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0',
                    task.priority === 'high'
                      ? 'bg-destructive/20 text-destructive'
                      : task.priority === 'medium'
                        ? 'bg-warning/20 text-warning'
                        : 'bg-primary/20 text-primary'
                  )}
                >
                  {task.priority}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
