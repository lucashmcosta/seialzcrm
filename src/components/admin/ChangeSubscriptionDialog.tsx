import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface ChangeSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string;
  currentPlan: string;
  currentSeats: number;
  onSuccess: () => void;
}

export function ChangeSubscriptionDialog({
  open,
  onOpenChange,
  subscriptionId,
  currentPlan,
  currentSeats,
  onSuccess,
}: ChangeSubscriptionDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [maxSeats, setMaxSeats] = useState(currentSeats);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase.from('plans').select('*').eq('is_active', true).order('sort_order');
      setPlans(data || []);
    };
    fetchPlans();
  }, []);

  const selectedPlanData = plans.find(p => p.name === selectedPlan);

  const handleSave = async () => {
    setLoading(true);

    try {
      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (!adminUser) throw new Error('Admin não encontrado');

      // Update subscription
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          plan_name: selectedPlan,
          max_seats: maxSeats,
          price_per_seat: selectedPlanData?.price_monthly || 0,
          is_free_plan: selectedPlan === 'free',
          status: 'active',
        })
        .eq('id', subscriptionId);

      if (updateError) throw updateError;

      // Log action
      await supabase.from('admin_audit_logs').insert({
        admin_user_id: adminUser.id,
        action: 'change_subscription',
        entity_type: 'subscription',
        entity_id: subscriptionId,
        details: {
          from_plan: currentPlan,
          to_plan: selectedPlan,
          max_seats: maxSeats,
        },
      });

      toast({
        title: 'Subscription atualizada',
        description: 'Plano alterado com sucesso.',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error changing subscription:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao alterar plano.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar Subscription</DialogTitle>
          <DialogDescription>
            Altere o plano e número de seats da conta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="plan">Plano</Label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger id="plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.name} value={plan.name}>
                    {plan.display_name} - R$ {plan.price_monthly}/mês (até {plan.max_seats || '∞'} usuários)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="seats">Número de Seats</Label>
            <Input
              id="seats"
              type="number"
              min={1}
              max={selectedPlanData?.max_seats || 999}
              value={maxSeats}
              onChange={(e) => setMaxSeats(parseInt(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Máximo: {selectedPlanData?.max_seats || 999} usuários
            </p>
          </div>
          {selectedPlanData && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Resumo:</p>
              <p className="text-sm text-muted-foreground">
                Plano: <strong>{selectedPlanData.display_name}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Valor: <strong>R$ {selectedPlanData.price_monthly}/mês</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Seats: <strong>{maxSeats} usuários</strong>
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
