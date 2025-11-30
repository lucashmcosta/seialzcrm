import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, DollarSign, Activity, Ban } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface KPIData {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalUsers: number;
  mrr: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<KPIData>({
    totalOrgs: 0,
    activeOrgs: 0,
    suspendedOrgs: 0,
    totalUsers: 0,
    mrr: 0,
  });
  const [loading, setLoading] = useState(true);
  const [orgGrowthData, setOrgGrowthData] = useState<any[]>([]);
  const [planDistributionData, setPlanDistributionData] = useState<any[]>([]);

  useEffect(() => {
    fetchKPIs();
  }, []);

  const fetchKPIs = async () => {
    try {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, created_at, suspended_at');

      const { data: metrics } = await supabase
        .from('organization_usage_metrics')
        .select('last_user_activity_at');

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activeOrgs = metrics?.filter(m => 
        m.last_user_activity_at && new Date(m.last_user_activity_at) > thirtyDaysAgo
      ).length || 0;

      const suspendedOrgs = orgs?.filter(o => o.suspended_at).length || 0;

      const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('price_per_seat, status, plan_name')
        .eq('status', 'active');

      const mrr = subscriptions?.reduce((sum, sub) => 
        sum + (Number(sub.price_per_seat) || 0), 0
      ) || 0;

      // Growth data (last 6 months)
      const growthData = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const count = orgs?.filter(o => {
          const created = new Date(o.created_at);
          return created >= monthStart && created <= monthEnd;
        }).length || 0;
        
        growthData.push({
          month: monthStart.toLocaleDateString('pt-BR', { month: 'short' }),
          orgs: count,
        });
      }
      setOrgGrowthData(growthData);

      // Plan distribution
      const planCounts = subscriptions?.reduce((acc: any, sub) => {
        const plan = sub.plan_name || 'free';
        acc[plan] = (acc[plan] || 0) + 1;
        return acc;
      }, {}) || {};

      const planData = Object.entries(planCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }));
      setPlanDistributionData(planData);

      setKpis({
        totalOrgs: orgs?.length || 0,
        activeOrgs,
        suspendedOrgs,
        totalUsers: totalUsers || 0,
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
      title: 'Total de Contas',
      value: kpis.totalOrgs,
      icon: Building2,
    },
    {
      title: 'Contas Ativas',
      value: kpis.activeOrgs,
      icon: Activity,
    },
    {
      title: 'Contas Suspensas',
      value: kpis.suspendedOrgs,
      icon: Ban,
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
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Crescimento de Contas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={orgGrowthData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="orgs" stroke="hsl(var(--primary))" name="Contas" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Distribuição de Planos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={planDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {planDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
