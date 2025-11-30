import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RefreshCw, Ban, Trash2, Mail, Play, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SuspendOrgDialog } from '@/components/admin/SuspendOrgDialog';
import { DeleteOrgDialog } from '@/components/admin/DeleteOrgDialog';
import { ChangeSubscriptionDialog } from '@/components/admin/ChangeSubscriptionDialog';

export default function AdminOrganizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [changeSubDialogOpen, setChangeSubDialogOpen] = useState(false);

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
            id,
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
      const { error } = await supabase.rpc('update_organization_usage_metrics', { org_id: id });
      
      if (error) throw error;
      
      await fetchOrganization();
      
      toast({
        title: 'Métricas atualizadas',
        description: 'As métricas foram recalculadas com sucesso.',
      });
    } catch (error: any) {
      console.error('Error recalculating metrics:', error);
      toast({
        title: 'Erro ao recalcular métricas',
        description: error.message || 'Falha ao recalcular métricas.',
        variant: 'destructive',
      });
    }
  };

  const handleReactivate = async () => {
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          suspended_at: null,
          suspended_reason: null,
          suspended_by_admin_id: null,
        })
        .eq('id', id);

      if (error) throw error;

      await fetchOrganization();
      toast({
        title: 'Organização reativada',
        description: 'A organização foi reativada com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao reativar organização.',
        variant: 'destructive',
      });
    }
  };

  const handleSendEmail = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'Funcionalidade de envio de email em breve.',
    });
  };

  const handleImpersonate = async (user: { id: string; full_name: string; email: string }) => {
    try {
      // 1. Save current admin session
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (adminSession) {
        localStorage.setItem('admin_session_backup', JSON.stringify({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        }));
      }

      // 2. Call edge function
      const { data, error } = await supabase.functions.invoke('admin-impersonate', {
        body: { userId: user.id },
      });

      if (error) throw error;

      // 3. Store impersonation data with return URL
      localStorage.setItem('admin_impersonation', JSON.stringify({
        userId: user.id,
        userName: user.full_name,
        userEmail: user.email,
        startedAt: new Date().toISOString(),
        returnUrl: window.location.pathname,
      }));

      // 4. Login as the user using hashed_token
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.hashed_token,
        type: 'email',
      });

      if (verifyError) throw verifyError;

      // 5. Redirect to CRM
      window.location.href = '/';
    } catch (error: any) {
      // Clean up backup if failed
      localStorage.removeItem('admin_session_backup');
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao iniciar impersonation.',
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

        {org.suspended_at && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <Ban className="h-5 w-5" />
                <div>
                  <p className="font-semibold">Organização Suspensa</p>
                  <p className="text-sm">
                    Suspensa em {format(new Date(org.suspended_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                  {org.suspended_reason && (
                    <p className="text-sm mt-1">Motivo: {org.suspended_reason}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="actions">Ações</TabsTrigger>
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
                      <div className="flex items-center gap-2">
                        <span className={`text-sm px-2 py-1 rounded ${userOrg.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {userOrg.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                        {userOrg.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImpersonate({
                              id: userOrg.user_id,
                              full_name: userOrg.users?.full_name,
                              email: userOrg.users?.email,
                            })}
                          >
                            <LogIn className="h-4 w-4 mr-1" />
                            Entrar como
                          </Button>
                        )}
                      </div>
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

          <TabsContent value="subscription" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Detalhes da Subscription</CardTitle>
                <Button onClick={() => setChangeSubDialogOpen(true)} size="sm">
                  Alterar Plano
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <span className="text-sm text-muted-foreground">Plano Atual:</span>
                    <p className="text-lg font-semibold capitalize">{org.subscriptions?.[0]?.plan_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <p>
                      <Badge variant={org.subscriptions?.[0]?.status === 'active' ? 'default' : 'secondary'}>
                        {org.subscriptions?.[0]?.status || 'N/A'}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Max Seats:</span>
                    <p className="text-lg font-semibold">{org.subscriptions?.[0]?.max_seats || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Preço por Seat:</span>
                    <p className="text-lg font-semibold">
                      R$ {org.subscriptions?.[0]?.price_per_seat || 0}
                    </p>
                  </div>
                  {org.subscriptions?.[0]?.current_period_start && (
                    <div>
                      <span className="text-sm text-muted-foreground">Período Atual:</span>
                      <p className="text-sm">
                        {format(new Date(org.subscriptions[0].current_period_start), 'dd/MM/yyyy', { locale: ptBR })}
                        {org.subscriptions[0].current_period_end && 
                          ` - ${format(new Date(org.subscriptions[0].current_period_end), 'dd/MM/yyyy', { locale: ptBR })}`
                        }
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ações Administrativas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {org.suspended_at ? (
                  <Button onClick={handleReactivate} variant="default" className="w-full justify-start">
                    <Play className="h-4 w-4 mr-2" />
                    Reativar Organização
                  </Button>
                ) : (
                  <Button onClick={() => setSuspendDialogOpen(true)} variant="destructive" className="w-full justify-start">
                    <Ban className="h-4 w-4 mr-2" />
                    Suspender Organização
                  </Button>
                )}
                
                <Button onClick={handleSendEmail} variant="outline" className="w-full justify-start">
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar Email para Organização
                </Button>

                <Button 
                  onClick={() => setDeleteDialogOpen(true)} 
                  variant="destructive" 
                  className="w-full justify-start"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Deletar Organização Permanentemente
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <SuspendOrgDialog
          open={suspendDialogOpen}
          onOpenChange={setSuspendDialogOpen}
          organizationId={id!}
          organizationName={org.name}
          onSuccess={fetchOrganization}
        />

        <DeleteOrgDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          organizationId={id!}
          organizationName={org.name}
          onSuccess={() => navigate('/admin/organizations')}
        />

        {org.subscriptions?.[0] && (
          <ChangeSubscriptionDialog
            open={changeSubDialogOpen}
            onOpenChange={setChangeSubDialogOpen}
            subscriptionId={org.subscriptions[0].id}
            currentPlan={org.subscriptions[0].plan_name}
            currentSeats={org.subscriptions[0].max_seats}
            onSuccess={fetchOrganization}
          />
        )}
      </div>
    </AdminLayout>
  );
}
