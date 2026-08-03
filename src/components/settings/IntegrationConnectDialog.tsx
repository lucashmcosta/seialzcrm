import { useState, useEffect } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { SpinnerGap, Info } from '@phosphor-icons/react';

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

interface TwilioVoiceSetupStatus {
  configured: boolean;
  credentialsAvailable: boolean;
  credentialsEncrypted: boolean;
  accountSid: string | null;
  phoneNumber: string | null;
  enableRecording: boolean;
  twimlAppSidSuffix: string | null;
  webhookMode: 'telephony_v2' | 'legacy';
}

async function edgeFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: string };
      if (payload.error) return payload.error;
    } catch {
      // The response body may already have been consumed by the client.
    }
  }
  return fallback;
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
  const [credentialsFromVoice, setCredentialsFromVoice] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<Array<{
    phone_number: string;
    friendly_name: string;
    is_whatsapp_sender: boolean;
  }>>([]);
  const [selectedWhatsAppNumber, setSelectedWhatsAppNumber] = useState<string>('');
  const [loadingNumbers, setLoadingNumbers] = useState(false);

  const isTwilioVoice = integration.slug === 'twilio-voice';
  const isTwilioWhatsApp = integration.slug === 'twilio-whatsapp';

  const { data: voiceSetupStatus, isLoading: loadingVoiceStatus } = useQuery({
    queryKey: ['twilio-voice-setup-status', organization?.id],
    enabled: !!organization?.id && isTwilioVoice && open,
    queryFn: async (): Promise<TwilioVoiceSetupStatus> => {
      const { data, error } = await supabase.functions.invoke('twilio-setup', {
        headers: { 'x-organization-id': organization!.id },
        body: { mode: 'status', organizationId: organization!.id },
      });
      if (error) throw error;
      return data as TwilioVoiceSetupStatus;
    },
  });

  useEffect(() => {
    if (!open || !isTwilioVoice || !voiceSetupStatus?.configured) return;
    setConfigValues((previous) => ({
      ...previous,
      account_sid: previous.account_sid || voiceSetupStatus.accountSid || '',
      phone_number: previous.phone_number || voiceSetupStatus.phoneNumber || '',
      enable_recording: previous.enable_recording ?? voiceSetupStatus.enableRecording,
    }));
  }, [open, isTwilioVoice, voiceSetupStatus]);

  // Fetch Twilio Voice credentials if connecting WhatsApp
  const { data: voiceIntegration } = useQuery({
    queryKey: ['twilio-voice-credentials', organization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('organization_integrations')
        .select(`
          config_values,
          admin_integrations!inner(slug)
        `)
        .eq('organization_id', organization!.id)
        .eq('admin_integrations.slug', 'twilio-voice')
        .eq('is_enabled', true)
        .maybeSingle();
      return data;
    },
    enabled: !!organization?.id && isTwilioWhatsApp && open,
  });

  // Pre-fill credentials from Voice integration if available
  useEffect(() => {
    if (voiceIntegration?.config_values && isTwilioWhatsApp) {
      const voiceConfig = voiceIntegration.config_values as any;
      if (voiceConfig.account_sid && voiceConfig.auth_token) {
        setConfigValues(prev => ({
          ...prev,
          account_sid: voiceConfig.account_sid,
          auth_token: voiceConfig.auth_token,
        }));
        setCredentialsFromVoice(true);
      }
    }
  }, [voiceIntegration, isTwilioWhatsApp]);

  // Fetch available numbers when Voice credentials are detected for WhatsApp
  useEffect(() => {
    if (!credentialsFromVoice || !isTwilioWhatsApp || !configValues.account_sid || !configValues.auth_token || !organization?.id || !open) return;

    const fetchNumbers = async () => {
      setLoadingNumbers(true);
      try {
        const { data, error } = await supabase.functions.invoke('twilio-whatsapp-setup', {
          body: {
            organizationId: organization.id,
            accountSid: configValues.account_sid,
            authToken: configValues.auth_token,
            mode: 'list-numbers',
          },
        });

        if (data?.success && data.phoneNumbers) {
          const whatsappSenders: string[] = data.whatsappSenders || [];
          const numbers = data.phoneNumbers.map((n: any) => ({
            phone_number: n.phone_number,
            friendly_name: n.friendly_name,
            is_whatsapp_sender: whatsappSenders.includes(n.phone_number),
          }));
          setAvailableNumbers(numbers);

          // Auto-select first WhatsApp Sender, or first number
          const firstSender = numbers.find((n: any) => n.is_whatsapp_sender);
          if (firstSender) {
            setSelectedWhatsAppNumber(firstSender.phone_number);
          } else if (numbers.length > 0) {
            setSelectedWhatsAppNumber(numbers[0].phone_number);
          }
        }
      } catch (e) {
        console.warn('Error fetching numbers:', e);
      } finally {
        setLoadingNumbers(false);
      }
    };

    fetchNumbers();
  }, [credentialsFromVoice, isTwilioWhatsApp, configValues.account_sid, configValues.auth_token, organization?.id, open]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setConfigValues({});
      setSetupPhase('form');
      setCredentialsFromVoice(false);
      setAvailableNumbers([]);
      setSelectedWhatsAppNumber('');
      setLoadingNumbers(false);
    }
  }, [open]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error('Organization not found');

      // Debug logs
      console.log('=== Connect Mutation Started ===');
      console.log('Integration:', { 
        id: integration.id, 
        slug: integration.slug, 
        name: integration.name 
      });
      console.log('Organization:', organization.id);
      console.log('isTwilioVoice:', isTwilioVoice);
      console.log('isTwilioWhatsApp:', isTwilioWhatsApp);
      console.log('configValues:', Object.keys(configValues));
      console.log('Has account_sid:', !!configValues.account_sid);
      console.log('Has auth_token:', !!configValues.auth_token);

      const { data: userData } = await supabase.auth.getUser();
      const { data: userProfile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userData.user?.id)
        .single();

      // For Twilio integrations, we'll let the setup function handle the upsert
      // For other integrations, save normally
      if (!isTwilioVoice && !isTwilioWhatsApp) {
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
      }

      // For Twilio Voice, run automatic setup
      if (isTwilioVoice) {
        if (!configValues.account_sid) {
          throw new Error('Account SID é obrigatório');
        }
        if (!configValues.auth_token && !voiceSetupStatus?.credentialsAvailable) {
          throw new Error('Informe o Auth Token para concluir a configuração');
        }
        
        setSetupPhase('configuring');
        
        console.log('Calling twilio-setup edge function...');
        
        const { data: setupData, error: setupError } = await supabase.functions.invoke('twilio-setup', {
          headers: { 'x-organization-id': organization.id },
          body: {
            organizationId: organization.id,
            accountSid: configValues.account_sid,
            authToken: configValues.auth_token || undefined,
            phoneNumber: configValues.phone_number || undefined,
            enableRecording: configValues.enable_recording,
          },
        });

        console.log('twilio-setup response:', { setupData, setupError });

        if (setupError) {
          console.error('Twilio Voice setup error:', setupError);
          throw new Error(await edgeFunctionErrorMessage(
            setupError,
            'Erro ao configurar Twilio Voice. Verifique suas credenciais.',
          ));
        }

        if (!setupData?.success) {
          throw new Error(setupData?.error || 'Erro na configuração do Twilio Voice');
        }

        console.log('Twilio Voice setup completed:', setupData);
      }

      // For Twilio WhatsApp, run automatic setup with full automation
      if (isTwilioWhatsApp) {
        if (!configValues.account_sid || !configValues.auth_token) {
          throw new Error('Credenciais do Twilio são obrigatórias (Account SID e Auth Token)');
        }

        setSetupPhase('configuring');
        
        console.log('Calling twilio-whatsapp-setup edge function with:', {
          organizationId: organization.id,
          hasAccountSid: !!configValues.account_sid,
          hasAuthToken: !!configValues.auth_token,
        });
        
        const { data: setupData, error: setupError } = await supabase.functions.invoke('twilio-whatsapp-setup', {
          body: {
            organizationId: organization.id,
            accountSid: configValues.account_sid,
            authToken: configValues.auth_token,
            selectedNumber: selectedWhatsAppNumber || undefined,
          },
        });

        console.log('twilio-whatsapp-setup response:', { setupData, setupError });

        if (setupError) {
          console.error('Twilio WhatsApp setup error:', setupError);
          throw new Error('Erro ao configurar WhatsApp. Verifique suas credenciais.');
        }

        if (!setupData?.success) {
          throw new Error(setupData?.error || 'Erro na configuração do WhatsApp');
        }

        console.log('Twilio WhatsApp setup completed:', setupData);
        
        // Show additional info about the setup
        if (setupData.messagingServiceSid) {
          toast.success(`Messaging Service criado: ${setupData.messagingServiceSid.slice(-8)}`);
        }
        if (setupData.templatesImported > 0) {
          toast.info(`${setupData.templatesImported} templates sincronizados`);
        }
      }
    },
    onSuccess: async () => {
      toast.success(`${integration.name} conectado com sucesso!`);
      // Force refresh all integration-related queries
      await queryClient.invalidateQueries({ queryKey: ['organization-integrations'] });
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-integration'] });
      await queryClient.invalidateQueries({ queryKey: ['twilio-voice-credentials'] });
      await queryClient.invalidateQueries({ queryKey: ['twilio-voice-setup-status'] });
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
    const canReuseVoiceSecret = isTwilioVoice && key === 'auth_token' && voiceSetupStatus?.credentialsAvailable;
    const fieldRequired = required && !canReuseVoiceSecret && !(isTwilioVoice && key === 'phone_number');

    const fieldLabel = (
      <Label htmlFor={key}>
        {label} {fieldRequired && <span className="text-destructive">*</span>}
      </Label>
    );

    const fieldDescription = (description || canReuseVoiceSecret) && (
      <p className="text-xs text-muted-foreground break-words">
        {canReuseVoiceSecret ? 'Deixe em branco para reutilizar o token já protegido no backend.' : description}
      </p>
    );

    switch (type) {
      case 'select':
        return (
          <div key={key} className="space-y-2 min-w-0">
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
          <div key={key} className="space-y-2 min-w-0">
            {fieldLabel}
            <Input
              id={key}
              type="number"
              placeholder={placeholder}
              required={fieldRequired}
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
          <div key={key} className="space-y-2 min-w-0">
            {fieldLabel}
            <Textarea
              id={key}
              placeholder={placeholder}
              required={fieldRequired}
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
          <div key={key} className="space-y-2 min-w-0">
            {fieldLabel}
            <Input
              id={key}
              type={type || 'text'}
              placeholder={canReuseVoiceSecret ? 'Token atual será reutilizado' : placeholder}
              required={fieldRequired}
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
            <DialogDescription className="break-words">
              {integration.description || 'Configure os parâmetros de conexão abaixo.'}
            </DialogDescription>
          </DialogHeader>

          {setupPhase === 'configuring' ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <SpinnerGap className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Configurando {integration.name} automaticamente...
              </p>
              <p className="text-xs text-muted-foreground">
                Isso pode levar alguns segundos
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4 overflow-y-auto max-h-[60vh]">
              {/* Show info if credentials from Voice */}
              {credentialsFromVoice && isTwilioWhatsApp && (
                <Alert className="bg-primary/10 border-primary/20">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Credenciais detectadas da integração Twilio Voice. Selecione o número para WhatsApp abaixo.
                  </AlertDescription>
                </Alert>
              )}

              {isTwilioVoice && voiceSetupStatus?.configured && (
                <Alert className="bg-primary/10 border-primary/20">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Configuração existente detectada. O número, a TwiML App
                    {voiceSetupStatus.twimlAppSidSuffix ? ` …${voiceSetupStatus.twimlAppSidSuffix}` : ''} e o Auth Token protegido serão reutilizados.
                    Webhook atual: {voiceSetupStatus.webhookMode === 'telephony_v2' ? 'Telefonia V2' : 'legado'}.
                  </AlertDescription>
                </Alert>
              )}

              {isTwilioVoice && !loadingVoiceStatus && !voiceSetupStatus?.configured && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Informe o Account SID e o Auth Token. O número é opcional: depois você poderá importar todos os números da conta ou comprar novas linhas na Central de Telefonia.
                  </AlertDescription>
                </Alert>
              )}

              {/* WhatsApp number selector */}
              {isTwilioWhatsApp && credentialsFromVoice && (
                <div className="space-y-2">
                  <Label>Número para WhatsApp <span className="text-destructive">*</span></Label>
                  {loadingNumbers ? (
                    <div className="flex items-center gap-2 py-2">
                      <SpinnerGap className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Buscando números da conta Twilio...</span>
                    </div>
                  ) : availableNumbers.length > 0 ? (
                    <>
                      <Select value={selectedWhatsAppNumber} onValueChange={setSelectedWhatsAppNumber}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o número..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableNumbers.map((num) => (
                            <SelectItem key={num.phone_number} value={num.phone_number}>
                              {num.phone_number}{num.is_whatsapp_sender ? ' (WhatsApp Sender)' : ''} — {num.friendly_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Números marcados como "WhatsApp Sender" já estão configurados no Twilio.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-destructive">
                      Nenhum número encontrado na conta Twilio.
                    </p>
                  )}
                </div>
              )}
              
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
              disabled={connectMutation.isPending || setupPhase === 'configuring' || (isTwilioVoice && loadingVoiceStatus)}
            >
              {connectMutation.isPending ? 'Conectando...' : 'Conectar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
