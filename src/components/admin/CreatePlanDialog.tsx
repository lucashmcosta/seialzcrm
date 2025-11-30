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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: any | null;
  onSuccess: () => void;
}

export function CreatePlanDialog({
  open,
  onOpenChange,
  plan,
  onSuccess,
}: CreatePlanDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    price_per_seat_monthly: 0,
    price_per_seat_yearly: 0,
    free_seats_limit: '',
    max_contacts: '',
    max_storage_mb: 500,
  });
  const { toast } = useToast();

  useEffect(() => {
    if (plan) {
      setFormData({
        name: plan.name,
        display_name: plan.display_name,
        description: plan.description || '',
        price_per_seat_monthly: plan.price_per_seat_monthly,
        price_per_seat_yearly: plan.price_per_seat_yearly,
        free_seats_limit: plan.free_seats_limit?.toString() || '',
        max_contacts: plan.max_contacts?.toString() || '',
        max_storage_mb: plan.max_storage_mb,
      });
    } else {
      setFormData({
        name: '',
        display_name: '',
        description: '',
        price_per_seat_monthly: 0,
        price_per_seat_yearly: 0,
        free_seats_limit: '',
        max_contacts: '',
        max_storage_mb: 500,
      });
    }
  }, [plan, open]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.display_name) {
      toast({
        title: 'Erro',
        description: 'Preencha os campos obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const data = {
        name: formData.name,
        display_name: formData.display_name,
        description: formData.description || null,
        price_per_seat_monthly: formData.price_per_seat_monthly,
        price_per_seat_yearly: formData.price_per_seat_yearly,
        free_seats_limit: formData.free_seats_limit ? parseInt(formData.free_seats_limit) : null,
        max_contacts: formData.max_contacts ? parseInt(formData.max_contacts) : null,
        max_storage_mb: formData.max_storage_mb,
      };

      let error;
      if (plan) {
        ({ error } = await supabase.from('plans').update(data).eq('id', plan.id));
      } else {
        ({ error } = await supabase.from('plans').insert(data));
      }

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: `Plano ${plan ? 'atualizado' : 'criado'} com sucesso.`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error saving plan:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar plano.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar' : 'Criar'} Plano</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Nome interno *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="free, starter, pro..."
                disabled={!!plan}
              />
            </div>
            <div>
              <Label htmlFor="display_name">Nome de exibição *</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="Free, Starter, Pro..."
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Para pequenas equipes..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price_per_seat_monthly">Preço por usuário/mês (R$)</Label>
              <Input
                id="price_per_seat_monthly"
                type="number"
                value={formData.price_per_seat_monthly}
                onChange={(e) =>
                  setFormData({ ...formData, price_per_seat_monthly: parseFloat(e.target.value) })
                }
              />
            </div>
            <div>
              <Label htmlFor="price_per_seat_yearly">Preço por usuário/ano (R$)</Label>
              <Input
                id="price_per_seat_yearly"
                type="number"
                value={formData.price_per_seat_yearly}
                onChange={(e) =>
                  setFormData({ ...formData, price_per_seat_yearly: parseFloat(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="free_seats_limit">Limite usuários grátis</Label>
              <Input
                id="free_seats_limit"
                type="number"
                value={formData.free_seats_limit}
                onChange={(e) => setFormData({ ...formData, free_seats_limit: e.target.value })}
                placeholder="Vazio = ilimitado"
              />
            </div>
            <div>
              <Label htmlFor="max_contacts">Máx. contatos</Label>
              <Input
                id="max_contacts"
                type="number"
                value={formData.max_contacts}
                onChange={(e) => setFormData({ ...formData, max_contacts: e.target.value })}
                placeholder="Vazio = ilimitado"
              />
            </div>
            <div>
              <Label htmlFor="max_storage_mb">Storage (MB)</Label>
              <Input
                id="max_storage_mb"
                type="number"
                value={formData.max_storage_mb}
                onChange={(e) =>
                  setFormData({ ...formData, max_storage_mb: parseInt(e.target.value) })
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
