import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AdminOrganizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    if (id) {
      fetchOrganization();
    }
  }, [id]);

  const fetchOrganization = async () => {
    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select(`
          *,
          subscriptions (*)
        `)
        .eq('id', id)
        .single();

      const { data: metricsData } = await supabase
        .from('organization_usage_metrics')
        .select('*')
        .eq('organization_id', id)
        .single();

      const { data: users } = await supabase
        .from('user_organizations')
        .select(`
          *,
          users (
            full_name,
            email
          )
        `)
        .eq('organization_id', id);

      setOrg({ ...orgData, users });
      setMetrics(metricsData);
    } catch (error) {
      console.error('Error fetching organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateMetrics = async () => {
    try {
      await supabase.rpc('update_organization_usage_metrics', { org_id: id });
      await fetchOrganization();
      
      toast({
        title: 'Métricas atualizadas',
        description: 'As métricas foram recalculadas com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao recalcular métricas.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </div>
      </AdminLayout>
    );
  }

  if (!org) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Organização não encontrada</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/organizations')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{org.name}</h1>
              <p className="text-muted-foreground">{org.slug}</p>
            </div>
          </div>
          <Button onClick={handleRecalculateMetrics} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Recalcular Métricas
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm text-muted-foreground">ID:</span>
                    <p className="font-mono text-sm">{org.id}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Criado em:</span>
                    <p>{format(new Date(org.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Timezone:</span>
                    <p>{org.timezone}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Moeda:</span>
                    <p>{org.default_currency}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm text-muted-foreground">Plano:</span>
                    <p className="capitalize">{org.subscriptions?.[0]?.plan_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <p className="capitalize">{org.subscriptions?.[0]?.status || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Max Seats:</span>
                    <p>{org.subscriptions?.[0]?.max_seats || 'N/A'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Usuários ({org.users?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {org.users?.map((userOrg: any) => (
                    <div key={userOrg.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{userOrg.users?.full_name}</p>
                        <p className="text-sm text-muted-foreground">{userOrg.users?.email}</p>
                      </div>
                      <span className={`text-sm px-2 py-1 rounded ${userOrg.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {userOrg.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Contatos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{metrics?.total_contacts || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Oportunidades</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{metrics?.total_opportunities || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tarefas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{metrics?.total_tasks || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ações (7 dias)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{metrics?.actions_last_7_days || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ações (30 dias)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{metrics?.actions_last_30_days || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Último Acesso</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    {metrics?.last_user_activity_at
                      ? format(new Date(metrics.last_user_activity_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                      : 'Nunca'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
