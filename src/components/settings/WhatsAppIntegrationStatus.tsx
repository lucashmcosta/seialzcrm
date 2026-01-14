import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  XCircle, 
  Phone, 
  MessageSquare, 
  Settings2, 
  RefreshCw,
  ExternalLink 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WhatsAppIntegrationStatusProps {
  onReconfigure?: () => void;
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

        {!webhooksConfigured && (
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

        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
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
