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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface IntegrationConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: {
    id: string;
    name: string;
    slug?: string;
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
  const [setupPhase, setSetupPhase] = useState<'form' | 'configuring'>('form');

  const isTwilioVoice = integration.slug === 'twilio-voice' || 
    integration.name.toLowerCase().includes('twilio');

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error('Organization not found');

      const { data: userData } = await supabase.auth.getUser();
      const { data: userProfile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userData.user?.id)
        .single();

      // Save/update the integration connection (upsert allows reconnecting existing integrations)
      const { error } = await supabase
        .from('organization_integrations')
        .upsert(
          {
            organization_id: organization.id,
            integration_id: integration.id,
            config_values: configValues,
            is_enabled: true,
            connected_at: new Date().toISOString(),
            connected_by_user_id: userProfile?.id,
          },
          {
            onConflict: 'integration_id,organization_id',
          }
        );

      if (error) throw error;

      // For Twilio Voice, run automatic setup
      if (isTwilioVoice && configValues.account_sid && configValues.auth_token) {
        setSetupPhase('configuring');
        
        const { data: setupData, error: setupError } = await supabase.functions.invoke('twilio-setup', {
          body: {
            organizationId: organization.id,
            accountSid: configValues.account_sid,
            authToken: configValues.auth_token,
            phoneNumber: configValues.phone_number,
            enableRecording: configValues.enable_recording,
          },
        });

        if (setupError) {
          console.error('Twilio setup error:', setupError);
          throw new Error('Erro ao configurar Twilio automaticamente. Verifique suas credenciais.');
        }

        if (!setupData?.success) {
          throw new Error(setupData?.error || 'Erro na configuração do Twilio');
        }

        console.log('Twilio setup completed:', setupData);
      }
    },
    onSuccess: () => {
      toast.success(`${integration.name} conectado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['organization-integrations'] });
      onOpenChange(false);
      setConfigValues({});
      setSetupPhase('form');
    },
    onError: (error: any) => {
      toast.error(`Erro ao conectar: ${error.message}`);
      setSetupPhase('form');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connectMutation.mutate();
  };

  const renderField = (field: any) => {
    const { key, label, type, placeholder, required, options, description } = field;

    const fieldLabel = (
      <Label htmlFor={key}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
    );

    const fieldDescription = description && (
      <p className="text-xs text-muted-foreground">{description}</p>
    );

    switch (type) {
      case 'select':
        return (
          <div key={key} className="space-y-2">
            {fieldLabel}
            <Select
              value={configValues[key] || field.default || ''}
              onValueChange={(value) =>
                setConfigValues({ ...configValues, [key]: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {options?.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldDescription}
          </div>
        );
      case 'number':
        return (
          <div key={key} className="space-y-2">
            {fieldLabel}
            <Input
              id={key}
              type="number"
              placeholder={placeholder}
              required={required}
              value={configValues[key] ?? field.default ?? ''}
              onChange={(e) =>
                setConfigValues({ ...configValues, [key]: parseInt(e.target.value) || 0 })
              }
            />
            {fieldDescription}
          </div>
        );
      case 'textarea':
        return (
          <div key={key} className="space-y-2">
            {fieldLabel}
            <Textarea
              id={key}
              placeholder={placeholder}
              required={required}
              value={configValues[key] || ''}
              onChange={(e) =>
                setConfigValues({ ...configValues, [key]: e.target.value })
              }
            />
            {fieldDescription}
          </div>
        );
      case 'checkbox':
        return (
          <div key={key} className="flex items-center space-x-2">
            <input
              id={key}
              type="checkbox"
              checked={configValues[key] || false}
              onChange={(e) =>
                setConfigValues({ ...configValues, [key]: e.target.checked })
              }
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor={key}>{label}</Label>
          </div>
        );
      default:
        return (
          <div key={key} className="space-y-2">
            {fieldLabel}
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
            {fieldDescription}
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

          {setupPhase === 'configuring' ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Configurando {integration.name} automaticamente...
              </p>
              <p className="text-xs text-muted-foreground">
                Isso pode levar alguns segundos
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {fields.length > 0 ? (
                fields.map((field: any) => renderField(field))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Esta integração não requer configuração adicional.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={connectMutation.isPending}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={connectMutation.isPending || setupPhase === 'configuring'}
            >
              {connectMutation.isPending ? 'Conectando...' : 'Conectar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
