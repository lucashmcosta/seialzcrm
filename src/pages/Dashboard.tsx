import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Users, Briefcase, TrendingUp, TrendingDown, UserPlus } from 'lucide-react';

export default function Dashboard() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [stats, setStats] = useState({
    openOpportunities: 0,
    pipelineValue: 0,
    wonCount: 0,
    lostCount: 0,
    newContacts: 0,
  });

  useEffect(() => {
    if (!organization) return;

    const fetchStats = async () => {
      // Get open opportunities count and sum
      const { data: openOpps } = await supabase
        .from('opportunities')
        .select('amount')
        .eq('organization_id', organization.id)
        .eq('status', 'open')
        .is('deleted_at', null);

      const openCount = openOpps?.length || 0;
      const pipelineValue = openOpps?.reduce((sum, opp) => sum + (Number(opp.amount) || 0), 0) || 0;

      // Get won opportunities (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: wonOpps } = await supabase
        .from('opportunities')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('status', 'won')
        .gte('updated_at', thirtyDaysAgo.toISOString());

      // Get lost opportunities (last 30 days)
      const { data: lostOpps } = await supabase
        .from('opportunities')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('status', 'lost')
        .gte('updated_at', thirtyDaysAgo.toISOString());

      // Get new contacts (last 30 days)
      const { data: newContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organization.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .is('deleted_at', null);

      setStats({
        openOpportunities: openCount,
        pipelineValue: pipelineValue,
        wonCount: wonOpps?.length || 0,
        lostCount: lostOpps?.length || 0,
        newContacts: newContacts?.length || 0,
      });
    };

    fetchStats();
  }, [organization]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(locale === 'en-US' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: organization?.default_currency || 'BRL',
    }).format(value);
  };

  return (
    <Layout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('dashboard.welcome')}, {organization?.name}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.openOpportunities')}
              </CardTitle>
              <Briefcase className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.openOpportunities}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.pipelineValue')}
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {formatCurrency(stats.pipelineValue)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.wonThisPeriod')}
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.wonCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Últimos 30 dias</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.lostThisPeriod')}
              </CardTitle>
              <TrendingDown className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{stats.lostCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Últimos 30 dias</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.newContacts')}
              </CardTitle>
              <UserPlus className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.newContacts}</div>
              <p className="text-xs text-muted-foreground mt-1">Últimos 30 dias</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.myTasksToday')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Nenhuma tarefa para hoje</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Nenhuma atividade recente</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}