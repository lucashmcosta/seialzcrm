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
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle } from 'lucide-react';

interface DeleteOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  onSuccess: () => void;
}

export function DeleteOrgDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  onSuccess,
}: DeleteOrgDialogProps) {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (confirmation !== organizationName) {
      toast({
        title: 'Erro',
        description: 'O nome da organização não confere.',
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

      // Delete organization (cascade will handle related records)
      const { error: deleteError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', organizationId);

      if (deleteError) throw deleteError;

      // Log action
      await supabase.from('admin_audit_logs').insert({
        admin_user_id: adminUser.id,
        action: 'delete_organization',
        entity_type: 'organization',
        entity_id: organizationId,
        details: { name: organizationName },
      });

      toast({
        title: 'Organização deletada',
        description: 'A organização foi deletada permanentemente.',
      });

      setConfirmation('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error deleting organization:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao deletar organização.',
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
            Deletar Organização
          </DialogTitle>
          <DialogDescription>
            Esta ação é <strong>IRREVERSÍVEL</strong>. Todos os dados da organização 
            serão permanentemente deletados, incluindo:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Todos os contatos e oportunidades</li>
            <li>Todas as tarefas e atividades</li>
            <li>Todos os usuários e suas configurações</li>
            <li>Todos os arquivos anexados</li>
          </ul>
          <div>
            <Label htmlFor="confirmation">
              Digite <strong>{organizationName}</strong> para confirmar:
            </Label>
            <Input
              id="confirmation"
              placeholder={organizationName}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete} 
            disabled={loading || confirmation !== organizationName}
          >
            {loading ? 'Deletando...' : 'Deletar Permanentemente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
