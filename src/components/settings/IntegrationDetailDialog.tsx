import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Phone, CheckCircle2, XCircle, Settings2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
    return value.substring(0, 4) + '•'.repeat(12) + value.substring(value.length - 4);
  };

  const renderTwilioConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground">Account SID</Label>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md">
          {maskSecret(configValues.accountSid)}
        </p>
      </div>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Número de Telefone</Label>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md flex items-center gap-2">
          <Phone className="h-4 w-4" />
          {configValues.twilioPhoneNumber || 'Não configurado'}
        </p>
      </div>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Gravação Automática</Label>
        <div className="flex items-center gap-2">
          {configValues.enableRecording ? (
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

  const renderGenericConfig = () => {
    const entries = Object.entries(configValues).filter(([key]) => 
      !key.toLowerCase().includes('secret') && 
      !key.toLowerCase().includes('token') && 
      !key.toLowerCase().includes('password')
    );

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
          <div key={key} className="space-y-2">
            <Label className="text-muted-foreground capitalize">
              {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
            </Label>
            <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md">
              {String(value) || 'Não configurado'}
            </p>
          </div>
        ))}
      </div>
    );
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
          {integration?.slug === 'twilio-voice' ? renderTwilioConfig() : renderGenericConfig()}
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
