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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle } from 'lucide-react';

interface SuspendOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  onSuccess: () => void;
}

export function SuspendOrgDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  onSuccess,
}: SuspendOrgDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSuspend = async () => {
    if (!reason.trim()) {
      toast({
        title: 'Erro',
        description: 'Informe o motivo da suspensão.',
        variant: 'destructive',
      });
      return;
    }

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

      // Suspend organization
      const { error: suspendError } = await supabase
        .from('organizations')
        .update({
          suspended_at: new Date().toISOString(),
          suspended_reason: reason,
          suspended_by_admin_id: adminUser.id,
        })
        .eq('id', organizationId);

      if (suspendError) throw suspendError;

      // Log action
      await supabase.from('admin_audit_logs').insert({
        admin_user_id: adminUser.id,
        action: 'suspend_organization',
        entity_type: 'organization',
        entity_id: organizationId,
        details: { reason },
      });

      toast({
        title: 'Conta suspensa',
        description: 'A conta foi suspensa com sucesso.',
      });

      setReason('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error suspending organization:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao suspender conta.',
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
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Suspender Conta
          </DialogTitle>
          <DialogDescription>
            Você está prestes a suspender <strong>{organizationName}</strong>. 
            Esta ação impedirá todos os usuários de acessar o sistema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="reason">Motivo da Suspensão</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Falta de pagamento, violação de termos..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSuspend} disabled={loading}>
            {loading ? 'Suspendendo...' : 'Suspender'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
