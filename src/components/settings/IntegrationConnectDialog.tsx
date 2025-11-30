import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface IntegrationConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: {
    id: string;
    name: string;
    description: string | null;
    config_schema: any;
  };
}

export function IntegrationConnectDialog({
  open,
  onOpenChange,
  integration,
}: IntegrationConnectDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [configValues, setConfigValues] = useState<Record<string, any>>({});

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error('Organization not found');

      const { data: userData } = await supabase.auth.getUser();
      const { data: userProfile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userData.user?.id)
        .single();

      const { error } = await supabase
        .from('organization_integrations')
        .insert({
          organization_id: organization.id,
          integration_id: integration.id,
          config_values: configValues,
          is_enabled: true,
          connected_at: new Date().toISOString(),
          connected_by_user_id: userProfile?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${integration.name} conectado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['organization-integrations'] });
      onOpenChange(false);
      setConfigValues({});
    },
    onError: (error: any) => {
      toast.error(`Erro ao conectar: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connectMutation.mutate();
  };

  const renderField = (field: any) => {
    const { key, label, type, placeholder, required } = field;

    switch (type) {
      case 'textarea':
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>
              {label} {required && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id={key}
              placeholder={placeholder}
              required={required}
              value={configValues[key] || ''}
              onChange={(e) =>
                setConfigValues({ ...configValues, [key]: e.target.value })
              }
            />
          </div>
        );
      default:
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>
              {label} {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={key}
              type={type || 'text'}
              placeholder={placeholder}
              required={required}
              value={configValues[key] || ''}
              onChange={(e) =>
                setConfigValues({ ...configValues, [key]: e.target.value })
              }
            />
          </div>
        );
    }
  };

  const fields = integration.config_schema?.fields || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Conectar {integration.name}</DialogTitle>
            <DialogDescription>
              {integration.description || 'Configure os parâmetros de conexão abaixo.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {fields.length > 0 ? (
              fields.map((field: any) => renderField(field))
            ) : (
              <p className="text-sm text-muted-foreground">
                Esta integração não requer configuração adicional.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={connectMutation.isPending}>
              {connectMutation.isPending ? 'Conectando...' : 'Conectar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
