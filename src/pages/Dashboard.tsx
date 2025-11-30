import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, TrendingDown, Users, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts';
import { Link } from 'react-router-dom';

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
  const { organization, userProfile, locale } = useOrganization();
  const { user } = useAuth();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  
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

  useEffect(() => {
    if (organization && userProfile) {
      fetchUsers();
      fetchStats();
    }
  }, [organization, userProfile, period, ownerId]);

  const fetchUsers = async () => {
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
  };

  const fetchStats = async () => {
    if (!organization || !userProfile) return;
    
    setLoading(true);
    
    try {
      const daysAgo = parseInt(period);
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - daysAgo);
      
      // Build owner filter
      let ownerFilter = {};
      if (ownerId !== 'all') {
        ownerFilter = { owner_user_id: ownerId };
      }
      
      // Open opportunities
      const { count: openCount, data: openOpps } = await supabase
        .from('opportunities')
        .select('amount', { count: 'exact' })
        .eq('organization_id', organization.id)
        .eq('status', 'open')
        .is('deleted_at', null)
        .match(ownerFilter);
      
      setOpenOpportunities(openCount || 0);
      const totalValue = (openOpps || []).reduce((sum, opp) => sum + (opp.amount || 0), 0);
      setPipelineValue(totalValue);
      
      // Won opportunities
      const { data: wonOpps } = await supabase
        .from('opportunities')
        .select('amount, updated_at')
        .eq('organization_id', organization.id)
        .eq('status', 'won')
        .gte('updated_at', dateFilter.toISOString())
        .is('deleted_at', null)
        .match(ownerFilter);
      
      const wonTotal = (wonOpps || []).reduce((sum, opp) => sum + (opp.amount || 0), 0);
      setWonAmount(wonTotal);
      
      // Lost opportunities
      const { count: lostCount } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'lost')
        .gte('updated_at', dateFilter.toISOString())
        .is('deleted_at', null)
        .match(ownerFilter);
      
      setLostCount(lostCount || 0);
      
      // New contacts
      const { count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .gte('created_at', dateFilter.toISOString())
        .is('deleted_at', null)
        .match(ownerFilter);
      
      setNewContacts(contactsCount || 0);
      
      // Chart data - opportunities by stage
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .eq('organization_id', organization.id)
        .eq('type', 'custom')
        .order('order_index');
      
      if (stages) {
        const stageStats = await Promise.all(
          stages.map(async (stage) => {
            const { data: opps } = await supabase
              .from('opportunities')
              .select('amount')
              .eq('organization_id', organization.id)
              .eq('pipeline_stage_id', stage.id)
              .eq('status', 'open')
              .is('deleted_at', null)
              .match(ownerFilter);
            
            const total = (opps || []).reduce((sum, opp) => sum + (opp.amount || 0), 0);
            return { name: stage.name, value: total };
          })
        );
        
        setStageData(stageStats);
      }
      
      // Trend data - won amount over time
      if (wonOpps) {
        const grouped = wonOpps.reduce((acc: any, opp) => {
          const date = new Date(opp.updated_at).toLocaleDateString(locale);
          if (!acc[date]) acc[date] = 0;
          acc[date] += opp.amount || 0;
          return acc;
        }, {});
        
        const trend = Object.entries(grouped).map(([date, amount]) => ({
          date,
          amount
        }));
        
        setTrendData(trend);
      }
      
      // My tasks today
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
      
      // Recent activities
      const { data: activities } = await supabase
        .from('activities')
        .select('id, title, activity_type, occurred_at, contact_id, contacts(full_name)')
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .limit(10);
      
      setRecentActivities(activities || []);
      
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

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
                <DollarSign className="w-8 h-8 text-primary" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.pipelineValue')}</p>
                  <p className="text-2xl font-bold">{formatCurrency(pipelineValue)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-primary" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.wonAmount')}</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(wonAmount)}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.lostOpportunities')}</p>
                  <p className="text-2xl font-bold text-red-600">{lostCount}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-red-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboard.newContacts')}</p>
                  <p className="text-2xl font-bold">{newContacts}</p>
                </div>
                <Users className="w-8 h-8 text-primary" />
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
              <h3 className="text-lg font-semibold mb-4">{t('dashboard.recentActivities')}</h3>
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
