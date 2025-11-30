import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface ExtendTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string;
  organizationId: string;
  currentTrialDays: number;
  onSuccess: () => void;
}

export function ExtendTrialDialog({
  open,
  onOpenChange,
  subscriptionId,
  organizationId,
  currentTrialDays,
  onSuccess,
}: ExtendTrialDialogProps) {
  const [extraDays, setExtraDays] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!extraDays || parseInt(extraDays) <= 0) {
      toast({
        title: 'Erro',
        description: 'Informe um número válido de dias.',
        variant: 'destructive',
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: 'Erro',
        description: 'Informe o motivo da extensão.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (!adminUser) throw new Error('Admin não encontrado');

      const days = parseInt(extraDays);
      const newTrialEnd = new Date();
      newTrialEnd.setDate(newTrialEnd.getDate() + days);

      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          trial_ends_at: newTrialEnd.toISOString(),
          extended_trial_days: days,
          trial_extended_by_admin_id: adminUser.id,
          trial_extension_reason: reason,
        })
        .eq('id', subscriptionId);

      if (updateError) throw updateError;

      // Log action
      await supabase.from('admin_audit_logs').insert({
        admin_user_id: adminUser.id,
        action: 'extend_trial',
        entity_type: 'subscription',
        entity_id: subscriptionId,
        details: {
          organization_id: organizationId,
          extra_days: days,
          reason: reason,
          new_trial_end: newTrialEnd.toISOString(),
        },
      });

      toast({
        title: 'Trial estendido',
        description: `Trial estendido por ${days} dias.`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error extending trial:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao estender trial.',
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
          <DialogTitle>Estender Período de Trial</DialogTitle>
          <DialogDescription>
            Adicione dias extras ao período de avaliação desta conta
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="days">Dias adicionais</Label>
            <Input
              id="days"
              type="number"
              min="1"
              value={extraDays}
              onChange={(e) => setExtraDays(e.target.value)}
              placeholder="Ex: 7, 14, 30..."
            />
          </div>
          <div>
            <Label htmlFor="reason">Motivo da extensão *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explique por que está estendendo o trial..."
              rows={3}
            />
          </div>
          <div className="p-4 bg-muted rounded-lg text-sm">
            <p className="text-muted-foreground">
              Trial atual: <strong>{currentTrialDays} dias</strong>
            </p>
            {extraDays && (
              <p className="text-muted-foreground mt-1">
                Novo total: <strong>{currentTrialDays + parseInt(extraDays)} dias</strong>
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Estendendo...' : 'Estender Trial'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
