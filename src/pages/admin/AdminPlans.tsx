import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Power, PowerOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CreatePlanDialog } from '@/components/admin/CreatePlanDialog';

interface Plan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  max_seats: number | null;
  max_contacts: number | null;
  max_storage_mb: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  account_count?: number;
}

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const { toast } = useToast();

  const fetchPlans = async () => {
    try {
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .order('sort_order');

      if (plansError) throw plansError;

      // Buscar contagem de contas por plano
      const plansWithCounts = await Promise.all(
        (plansData || []).map(async (plan) => {
          const { count } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('plan_name', plan.name);

          return { 
            ...plan, 
            features: (plan.features as any) || [],
            account_count: count || 0 
          };
        })
      );

      setPlans(plansWithCounts);
    } catch (error: any) {
      console.error('Error fetching plans:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar planos.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleToggleActive = async (plan: Plan) => {
    try {
      const { error } = await supabase
        .from('plans')
        .update({ is_active: !plan.is_active })
        .eq('id', plan.id);

      if (error) throw error;

      toast({
        title: 'Plano atualizado',
        description: `Plano ${plan.is_active ? 'desativado' : 'ativado'} com sucesso.`,
      });

      fetchPlans();
    } catch (error: any) {
      console.error('Error toggling plan:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao atualizar plano.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingPlan(null);
    setDialogOpen(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Planos</h1>
            <p className="text-muted-foreground">
              Gerencie os planos de assinatura do sistema
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Plano
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">Carregando planos...</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {plan.display_name}
                        {!plan.is_active && (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{plan.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold">
                      R$ {plan.price_monthly}
                      <span className="text-sm font-normal text-muted-foreground">/mês</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      R$ {plan.price_yearly}/ano
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Usuários:</span>
                      <span className="font-medium">
                        {plan.max_seats || 'Ilimitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contatos:</span>
                      <span className="font-medium">
                        {plan.max_contacts?.toLocaleString() || 'Ilimitado'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Armazenamento:</span>
                      <span className="font-medium">{plan.max_storage_mb} MB</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="text-sm text-muted-foreground mb-2">
                      {plan.account_count} conta{plan.account_count !== 1 ? 's' : ''}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(plan)}
                        className="flex-1"
                      >
                        <Edit className="mr-2 h-3 w-3" />
                        Editar
                      </Button>
                      <Button
                        variant={plan.is_active ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => handleToggleActive(plan)}
                        className="flex-1"
                      >
                        {plan.is_active ? (
                          <>
                            <PowerOff className="mr-2 h-3 w-3" />
                            Desativar
                          </>
                        ) : (
                          <>
                            <Power className="mr-2 h-3 w-3" />
                            Ativar
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <CreatePlanDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          plan={editingPlan}
          onSuccess={fetchPlans}
        />
      </div>
    </AdminLayout>
  );
}
