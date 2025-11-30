import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, DollarSign, Activity } from 'lucide-react';

interface KPIData {
  totalOrgs: number;
  activeOrgs: number;
  totalUsers: number;
  mrr: number;
}

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<KPIData>({
    totalOrgs: 0,
    activeOrgs: 0,
    totalUsers: 0,
    mrr: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIs();
  }, []);

  const fetchKPIs = async () => {
    try {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, created_at');

      const { data: metrics } = await supabase
        .from('organization_usage_metrics')
        .select('last_user_activity_at');

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activeOrgs = metrics?.filter(m => 
        m.last_user_activity_at && new Date(m.last_user_activity_at) > thirtyDaysAgo
      ).length || 0;

      const { data: users } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true });

      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('price_per_seat, status')
        .eq('status', 'active');

      const mrr = subscriptions?.reduce((sum, sub) => 
        sum + (Number(sub.price_per_seat) || 0), 0
      ) || 0;

      setKpis({
        totalOrgs: orgs?.length || 0,
        activeOrgs,
        totalUsers: users?.length || 0,
        mrr,
      });
    } catch (error) {
      console.error('Error fetching KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  const kpiCards = [
    {
      title: 'Total de Organizações',
      value: kpis.totalOrgs,
      icon: Building2,
    },
    {
      title: 'Organizações Ativas',
      value: kpis.activeOrgs,
      icon: Activity,
    },
    {
      title: 'Total de Usuários',
      value: kpis.totalUsers,
      icon: Users,
    },
    {
      title: 'MRR',
      value: `R$ ${kpis.mrr.toLocaleString('pt-BR')}`,
      icon: DollarSign,
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Carregando métricas...</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.title}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {kpi.title}
                    </CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpi.value}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
