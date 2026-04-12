import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDollar, TrendUp, TrendDown, UsersThree, CheckCircle } from '@phosphor-icons/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { MobileDashboard } from '@/components/mobile/MobileDashboard';

interface Task {
  id: string;
  title: string;
  due_at: string;
  priority: string;
  contact_id: string | null;
  contacts?: { full_name: string };
}

interface Activity {
  id: string;
  title: string;
  activity_type: string;
  occurred_at: string;
  contact_id: string | null;
  contacts?: { full_name: string };
}

export default function Dashboard() {
  const { organization, userProfile, locale, loading: orgLoading, error } = useOrganization();
  const { user, signOut } = useAuth();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Local UI state (MUST be declared before any early return)
  const [period, setPeriod] = useState('30');
  const [ownerId, setOwnerId] = useState('all');
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  const [openOpportunities, setOpenOpportunities] = useState(0);
  const [pipelineValue, setPipelineValue] = useState(0);
  const [wonAmount, setWonAmount] = useState(0);
  const [lostCount, setLostCount] = useState(0);
  const [newContacts, setNewContacts] = useState(0);

  const [stageData, setStageData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);

  const [loading, setLoading] = useState(true);

  // Redirect to login if not authenticated (do this as an effect)
  useEffect(() => {
    if (!orgLoading && !user) {
      navigate('/auth/signin', { replace: true });
    }
  }, [orgLoading, user, navigate]);

  // Fetch dashboard data when org/profile is available
  useEffect(() => {
    if (organization && userProfile) {
      fetchUsers();
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, userProfile?.id, period, ownerId]);

  // Mobile layout
  if (isMobile) {
    if (orgLoading) {
      return (
        <MobileLayout>
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-md animate-pulse" />
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

  // Show skeleton ONLY while loading
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
            <div className="flex gap-4 mb-6">
              <div className="h-10 w-48 bg-muted rounded animate-pulse" />
              <div className="h-10 w-48 bg-muted rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="h-80 bg-muted rounded-lg animate-pulse" />
              <div className="h-80 bg-muted rounded-lg animate-pulse" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 bg-muted rounded-lg animate-pulse" />
              <div className="h-64 bg-muted rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // If auth finished and user is not present, render nothing while redirect happens
  if (!user) {
    return null;
  }

  // Error state: profile not found (only show if user exists but profile doesn't)
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

  // No organization state
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

  async function fetchUsers() {
    if (!organization) return;
    
    const { data } = await supabase
      .from('user_organizations')
      .select('user_id, users(id, full_name)')
      .eq('organization_id', organization.id)
      .eq('is_active', true);
    
    if (data) {
      const usersList = data
        .filter(u => u.users)
        .map(u => ({ id: u.users!.id, full_name: u.users!.full_name }));
      setUsers(usersList);
    }
  }

  async function fetchStats() {
    if (!organization || !userProfile) return;

    setLoading(true);

    try {
      const daysAgo = parseInt(period);
      const ownerParam = ownerId !== 'all' ? ownerId : null;

      // Single RPC call replaces 8+ separate queries
      const { data, error: rpcError } = await supabase
        .rpc('get_dashboard_stats', {
          p_organization_id: organization.id,
          p_days_ago: daysAgo,
          p_owner_user_id: ownerParam,
        });

      if (rpcError) {
        console.error('Error fetching dashboard stats:', rpcError);
        return;
      }

      if (data) {
        setOpenOpportunities(data.open_count || 0);
        setPipelineValue(data.pipeline_value || 0);
        setWonAmount(data.won_amount || 0);
        setLostCount(data.lost_count || 0);
        setNewContacts(data.new_contacts || 0);
        setStageData(data.stage_data || []);
        setMyTasks(data.tasks || []);
        setRecentActivities(data.activities || []);

        // Format won trend dates for display
        const trend = (data.won_trend || []).map((w: { date: string; amount: number }) => ({
          date: new Date(w.date).toLocaleDateString(locale),
          amount: w.amount,
        }));
        setTrendData(trend);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: organization?.default_currency || 'BRL',
    }).format(value);
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('dashboard.welcome')}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('dashboard.today')}</SelectItem>
                <SelectItem value="7">{t('dashboard.last7Days')}</SelectItem>
                <SelectItem value="30">{t('dashboard.last30Days')}</SelectItem>
                <SelectItem value="90">{t('dashboard.last90Days')}</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dashboard.allUsers')}</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.openOpportunities')}</p>
                  <p className="text-2xl font-bold">{openOpportunities}</p>
                </div>
                <CurrencyDollar size={32} weight="light" className="text-primary" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.pipelineValue')}</p>
                  <p className="text-2xl font-bold">{formatCurrency(pipelineValue)}</p>
                </div>
                <TrendUp size={32} weight="light" className="text-primary" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.wonAmount')}</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(wonAmount)}</p>
                </div>
                <CheckCircle size={32} weight="light" className="text-green-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.lostOpportunities')}</p>
                  <p className="text-2xl font-bold text-red-600">{lostCount}</p>
                </div>
                <TrendDown size={32} weight="light" className="text-red-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.newContacts')}</p>
                  <p className="text-2xl font-bold">{newContacts}</p>
                </div>
                <UsersThree size={32} weight="light" className="text-primary" />
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('dashboard.opportunitiesByStage')}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('dashboard.wonOverTime')}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Tasks & Activities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('dashboard.myTasksToday')}</h3>
              {myTasks.length === 0 ? (
                <p className="text-muted-foreground">{t('dashboard.noTasks')}</p>
              ) : (
                <div className="space-y-3">
                  {myTasks.map(task => (
                    <Link key={task.id} to="/tasks" className="block p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{task.title}</p>
                          {task.contacts && (
                            <p className="text-sm text-muted-foreground">{task.contacts.full_name}</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          task.priority === 'high' ? 'bg-red-100 text-red-700' :
                          task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('dashboard.recentActivity')}</h3>
              {recentActivities.length === 0 ? (
                <p className="text-muted-foreground">{t('dashboard.noActivities')}</p>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map(activity => (
                    <div key={activity.id} className="p-3 border rounded-lg">
                      <p className="font-medium">{activity.title}</p>
                      {activity.contacts && (
                        <p className="text-sm text-muted-foreground">{activity.contacts.full_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.occurred_at).toLocaleString(locale)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
