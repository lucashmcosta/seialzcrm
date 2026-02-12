import { useState } from 'react';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  Settings2, 
  RefreshCw,
  ExternalLink,
  Search,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';

interface WhatsAppIntegrationStatusProps {
  onReconfigure?: () => void;
}

interface WebhookDiagnosis {
  success: boolean;
  messaging_service_sid: string | null;
  webhooks: {
    inbound_request_url: string;
    status_callback: string;
    use_inbound_webhook_on_number: boolean;
  } | null;
  senders: string[];
  number_webhooks: { number: string; sms_url: string }[];
  expected_inbound_url: string;
  is_inbound_configured: boolean;
  has_whatsapp_senders: boolean;
  diagnosis: string;
}

export function WhatsAppIntegrationStatus({ onReconfigure }: WhatsAppIntegrationStatusProps) {
  const { 
    hasWhatsApp, 
    whatsappNumber, 
    messagingServiceSid, 
    availableNumbers,
    webhooksConfigured,
    setupCompletedAt,
    loading,
    refetch 
  } = useWhatsAppIntegration();

  const { organization } = useOrganization();
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<WebhookDiagnosis | null>(null);

  const getCredentials = async () => {
    if (!organization?.id) return null;
    const { data } = await supabase
      .from('organization_integrations')
      .select('config_values, admin_integrations!inner(slug)')
      .eq('organization_id', organization.id)
      .eq('admin_integrations.slug', 'twilio-whatsapp')
      .eq('is_enabled', true)
      .maybeSingle();
    const config = data?.config_values as any;
    return config ? { accountSid: config.account_sid, authToken: config.auth_token } : null;
  };

  const handleCheckWebhooks = async () => {
    const creds = await getCredentials();
    if (!creds) { toast.error('Credenciais não encontradas'); return; }
    
    setChecking(true);
    setDiagnosis(null);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-setup', {
        body: {
          organizationId: organization?.id,
          accountSid: creds.accountSid,
          authToken: creds.authToken,
          mode: 'check-webhooks',
        },
      });
      if (error) throw error;
      setDiagnosis(data as WebhookDiagnosis);
    } catch (e: any) {
      toast.error('Erro ao verificar webhooks: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setChecking(false);
    }
  };

  const handleFixWebhooks = async () => {
    const creds = await getCredentials();
    if (!creds) { toast.error('Credenciais não encontradas'); return; }
    
    setFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-setup', {
        body: {
          organizationId: organization?.id,
          accountSid: creds.accountSid,
          authToken: creds.authToken,
          mode: 'update-webhook',
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Webhooks corrigidos com sucesso!');
        setDiagnosis(null);
        refetch();
      } else {
        toast.error(data?.message || 'Falha ao corrigir webhooks');
      }
    } catch (e: any) {
      toast.error('Erro ao corrigir webhooks: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setFixing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasWhatsApp) {
    return null;
  }

  const StatusItem = ({ 
    label, 
    value, 
    success 
  }: { 
    label: string; 
    value: string | null; 
    success: boolean;
  }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {success ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="text-sm font-medium">
          {value || 'Não configurado'}
        </span>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">WhatsApp Business</CardTitle>
          </div>
          <Badge variant={hasWhatsApp ? 'default' : 'secondary'}>
            {hasWhatsApp ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
        <CardDescription>
          Configuração da integração WhatsApp via Twilio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y">
          <StatusItem 
            label="Número Principal"
            value={whatsappNumber}
            success={!!whatsappNumber}
          />
          <StatusItem 
            label="Messaging Service"
            value={messagingServiceSid ? `...${messagingServiceSid.slice(-8)}` : null}
            success={!!messagingServiceSid}
          />
          <StatusItem 
            label="Webhooks"
            value={webhooksConfigured ? 'Configurados automaticamente' : 'Configuração manual necessária'}
            success={!!webhooksConfigured}
          />
          {availableNumbers.length > 1 && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Números Disponíveis</span>
              <span className="text-sm font-medium">{availableNumbers.length}</span>
            </div>
          )}
          {setupCompletedAt && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Configurado em</span>
              <span className="text-sm text-muted-foreground">
                {format(new Date(setupCompletedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>

        {/* Webhook Diagnosis Results */}
        {diagnosis && (
          <div className={`rounded-lg border p-3 space-y-2 ${
            diagnosis.is_inbound_configured && diagnosis.has_whatsapp_senders
              ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
              : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
          }`}>
            <div className="flex items-start gap-2">
              {diagnosis.is_inbound_configured && diagnosis.has_whatsapp_senders ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              )}
              <div className="space-y-1 text-sm">
                <p className="font-medium">{diagnosis.diagnosis}</p>
                {diagnosis.webhooks && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Inbound URL: <code className="bg-muted px-1 rounded">{diagnosis.webhooks.inbound_request_url || 'não definida'}</code></p>
                    <p>Senders: {diagnosis.senders.length > 0 ? diagnosis.senders.join(', ') : 'nenhum'}</p>
                  </div>
                )}
              </div>
            </div>
            {(!diagnosis.is_inbound_configured) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleFixWebhooks}
                disabled={fixing}
                className="w-full mt-2"
              >
                {fixing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
                Corrigir Webhooks
              </Button>
            )}
          </div>
        )}

        {!webhooksConfigured && !diagnosis && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Atenção:</strong> Os webhooks precisam ser configurados manualmente no Console do Twilio.
            </p>
            <Button 
              variant="link" 
              size="sm" 
              className="p-0 h-auto text-amber-600 dark:text-amber-400"
              onClick={() => window.open('https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders', '_blank')}
            >
              Abrir Console Twilio <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}

        <div className="flex gap-2 pt-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckWebhooks}
            disabled={checking}
          >
            {checking ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Verificar Webhooks
          </Button>
          {onReconfigure && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onReconfigure}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Reconectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
