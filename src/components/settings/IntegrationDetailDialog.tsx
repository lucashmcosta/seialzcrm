import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Phone, CheckCircle2, XCircle, Settings2, MessageSquare, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhoneDisplay } from '@/lib/phoneUtils';

interface IntegrationDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  orgIntegration: any;
  onDisconnect: () => void;
  onReconfigure: () => void;
}

export function IntegrationDetailDialog({
  open,
  onOpenChange,
  integration,
  orgIntegration,
  onDisconnect,
  onReconfigure,
}: IntegrationDetailDialogProps) {
  const configValues = orgIntegration?.config_values || {};
  const connectedAt = orgIntegration?.connected_at;

  const maskSecret = (value: string | undefined) => {
    if (!value) return '•••••••••••••';
    if (value.length <= 8) return '•'.repeat(value.length);
    // Mostrar apenas 4 primeiros e 4 últimos caracteres
    return `${value.substring(0, 4)}••••••••${value.substring(value.length - 4)}`;
  };

  // Verifica se um campo é sensível e deve ser mascarado
  const isSensitiveField = (key: string) => {
    const lowerKey = key.toLowerCase();
    const sensitivePatterns = ['secret', 'token', 'password', 'key', 'api_key', 'apikey', 'sid'];
    return sensitivePatterns.some(pattern => lowerKey.includes(pattern));
  };

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

  const renderTwilioConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground">Account SID</Label>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md">
          {maskSecret(configValues.account_sid)}
        </p>
      </div>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Auth Token</Label>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md">
          {maskSecret(configValues.auth_token)}
        </p>
      </div>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Número de Telefone</Label>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md flex items-center gap-2">
          <Phone className="h-4 w-4" />
          {formatPhoneDisplay(configValues.phone_number) || 'Não configurado'}
        </p>
      </div>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Gravação Automática</Label>
        <div className="flex items-center gap-2">
          {configValues.enable_recording ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Ativada</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Desativada</span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderWhatsAppConfig = () => (
    <div className="space-y-4">
      <div className="divide-y">
        <StatusItem 
          label="Número Principal"
          value={formatPhoneDisplay(configValues.whatsapp_number)}
          success={!!configValues.whatsapp_number}
        />
        <StatusItem 
          label="Messaging Service"
          value={configValues.messaging_service_sid ? 
            `...${configValues.messaging_service_sid.slice(-8)}` : null}
          success={!!configValues.messaging_service_sid}
        />
        <StatusItem 
          label="Webhooks"
          value={configValues.webhooks_configured ? 
            'Configurados automaticamente' : 'Configuração manual necessária'}
          success={!!configValues.webhooks_configured}
        />
        {configValues.setup_completed_at && (
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Configurado em</span>
            <span className="text-sm text-muted-foreground">
              {format(new Date(configValues.setup_completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
        )}
      </div>

      {!configValues.webhooks_configured && (
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
    </div>
  );

  const renderGenericConfig = () => {
    const entries = Object.entries(configValues);

    if (entries.length === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhuma configuração adicional disponível.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => (
          <div key={key} className="space-y-2 min-w-0">
            <Label className="text-muted-foreground capitalize">
              {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
            </Label>
            <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md break-all overflow-hidden">
              {isSensitiveField(key) 
                ? maskSecret(String(value)) 
                : (String(value) || 'Não configurado')
              }
            </p>
          </div>
        ))}
      </div>
    );
  };

  const renderConfigDetails = () => {
    if (integration?.slug === 'twilio-voice') {
      return renderTwilioConfig();
    }
    if (integration?.slug === 'twilio-whatsapp') {
      return renderWhatsAppConfig();
    }
    return renderGenericConfig();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {integration?.logo_url ? (
              <img
                src={integration.logo_url}
                alt={integration.name}
                className="w-10 h-10 rounded-lg object-contain bg-muted p-1"
              />
            ) : (
              <div className="p-2 rounded-lg bg-muted">
                <Settings2 className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <DialogTitle>{integration?.name}</DialogTitle>
              <DialogDescription>
                Configurações da integração
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground">Status</Label>
            <Badge className="bg-green-500">Conectado</Badge>
          </div>

          {/* Connected at */}
          {connectedAt && (
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground">Conectado em</Label>
              <span className="text-sm">
                {format(new Date(connectedAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
          )}

          {/* Divider */}
          <div className="border-t" />

          {/* Configuration Details */}
          {renderConfigDetails()}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onReconfigure}
          >
            Reconfigurar
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onDisconnect}
          >
            Desconectar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
