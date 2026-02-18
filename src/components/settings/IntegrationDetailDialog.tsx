import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Phone, CheckCircle2, XCircle, Settings2, ExternalLink, Loader2, RefreshCw, Wrench, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface IntegrationDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  orgIntegration: any;
  onDisconnect: () => void;
  onReconfigure: () => void;
  onConfigUpdated?: () => void;
}

interface SenderDetail {
  sender_id: string;
  sid: string;
  status: string;
  callback_url?: string;
  status_callback_url?: string;
  webhook_correct: boolean;
}

interface WebhookCheckResult {
  senders: SenderDetail[];
  allCorrect: boolean;
  expectedWebhookUrl?: string;
  messaging_service_sid?: string | null;
  is_inbound_configured?: boolean;
}

export function IntegrationDetailDialog({
  open,
  onOpenChange,
  integration,
  orgIntegration,
  onDisconnect,
  onReconfigure,
  onConfigUpdated,
}: IntegrationDetailDialogProps) {
  const configValues = orgIntegration?.config_values || {};
  const connectedAt = orgIntegration?.connected_at;
  const configSchema = integration?.config_schema;

  const [checkingWebhooks, setCheckingWebhooks] = useState(false);
  const [fixingWebhooks, setFixingWebhooks] = useState(false);
  const [webhookResult, setWebhookResult] = useState<WebhookCheckResult | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  const maskSecret = (value: string | undefined) => {
    if (!value) return '•••••••••••••';
    if (value.length <= 8) return '•'.repeat(value.length);
    return `${value.substring(0, 4)}••••••••${value.substring(value.length - 4)}`;
  };

  const isSensitiveField = (key: string) => {
    const lowerKey = key.toLowerCase();
    const sensitivePatterns = ['secret', 'token', 'password', 'key', 'api_key', 'apikey', 'sid'];
    return sensitivePatterns.some(pattern => lowerKey.includes(pattern));
  };

  const handleStartEditing = () => {
    const schema = configSchema;
    const initialValues: Record<string, any> = {};

    if (schema?.fields) {
      schema.fields.forEach((field: any) => {
        // For sensitive fields, start empty so user can leave blank to keep current
        if (isSensitiveField(field.key)) {
          initialValues[field.key] = '';
        } else {
          // Pre-populate with current value or schema default
          initialValues[field.key] = configValues[field.key] ?? field.default ?? '';
        }
      });
    } else {
      // No schema: pre-populate all non-sensitive fields
      Object.entries(configValues).forEach(([key, value]) => {
        initialValues[key] = isSensitiveField(key) ? '' : value;
      });
    }

    setEditValues(initialValues);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditValues({});
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const merged = { ...configValues };
      const schema = configSchema;

      if (schema?.fields) {
        schema.fields.forEach((field: any) => {
          const newVal = editValues[field.key];
          if (isSensitiveField(field.key) && !newVal) {
            // Keep current value — don't overwrite
          } else if (newVal !== undefined && newVal !== '') {
            merged[field.key] = newVal;
          } else if (!isSensitiveField(field.key) && newVal !== undefined) {
            merged[field.key] = newVal;
          }
        });
      } else {
        Object.entries(editValues).forEach(([key, val]) => {
          if (isSensitiveField(key) && !val) return;
          merged[key] = val;
        });
      }

      const { error } = await supabase
        .from('organization_integrations')
        .update({ config_values: merged })
        .eq('id', orgIntegration.id);

      if (error) throw error;

      toast.success('Configurações atualizadas com sucesso!');
      setIsEditing(false);
      setEditValues({});
      onConfigUpdated?.();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckWebhooks = async () => {
    setCheckingWebhooks(true);
    setWebhookResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-setup', {
        body: {
          mode: 'check-webhooks',
          organizationId: orgIntegration.organization_id,
          accountSid: configValues.account_sid,
          authToken: configValues.auth_token,
        },
      });
      if (error) throw error;
      const result: WebhookCheckResult = {
        senders: data.senders || [],
        allCorrect: data.allCorrect || false,
        expectedWebhookUrl: data.expectedWebhookUrl || '',
        is_inbound_configured: data.senders?.some((s: any) => s.webhook_correct) || false,
      };
      setWebhookResult(result);
    } catch (err: any) {
      toast.error('Erro ao verificar webhooks: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setCheckingWebhooks(false);
    }
  };

  const handleFixWebhooks = async () => {
    setFixingWebhooks(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-setup', {
        body: {
          mode: 'update-webhook',
          organizationId: orgIntegration.organization_id,
          accountSid: configValues.account_sid,
          authToken: configValues.auth_token,
        },
      });
      if (error) throw error;
      toast.success('Webhooks corrigidos com sucesso!');
      await handleCheckWebhooks();
    } catch (err: any) {
      toast.error('Erro ao corrigir webhooks: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setFixingWebhooks(false);
    }
  };

  const StatusItem = ({ label, value, success }: { label: string; value: string | null; success: boolean }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {success ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="text-sm font-medium">{value || 'Não configurado'}</span>
      </div>
    </div>
  );

  const renderEditField = (field: any) => {
    const sensitive = isSensitiveField(field.key);
    const label = field.label || field.key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');

    if (field.type === 'select' && field.options?.length) {
      return (
        <div key={field.key} className="space-y-2">
          <Label>{label}{field.required && <span className="text-destructive ml-1">*</span>}</Label>
          <select
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={editValues[field.key] ?? ''}
            onChange={(e) => setEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
          >
            {!editValues[field.key] && <option value="">Selecione...</option>}
            {field.options.map((opt: string) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
      );
    }

    if (field.type === 'number') {
      return (
        <div key={field.key} className="space-y-2">
          <Label>{label}{field.required && <span className="text-destructive ml-1">*</span>}</Label>
          <Input
            type="number"
            value={editValues[field.key] ?? ''}
            onChange={(e) => setEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
          />
          {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <Label>{label}{field.required && !sensitive && <span className="text-destructive ml-1">*</span>}</Label>
        <Input
          type={sensitive ? 'password' : 'text'}
          value={editValues[field.key] ?? ''}
          onChange={(e) => setEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
          placeholder={sensitive ? 'Deixe em branco para manter a chave atual' : ''}
        />
        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      </div>
    );
  };

  const renderEditMode = () => {
    const schema = configSchema;

    if (schema?.fields?.length) {
      return (
        <div className="space-y-4">
          {schema.fields.map((field: any) => renderEditField(field))}
        </div>
      );
    }

    // Fallback: render editable inputs for each config value
    const entries = Object.entries(configValues);
    if (entries.length === 0) return null;

    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => {
          const sensitive = isSensitiveField(key);
          const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
          return (
            <div key={key} className="space-y-2">
              <Label className="capitalize">{label}</Label>
              <Input
                type={sensitive ? 'password' : 'text'}
                value={editValues[key] ?? ''}
                onChange={(e) => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={sensitive ? 'Deixe em branco para manter a chave atual' : ''}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderTwilioConfig = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground">Account SID</Label>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md">{maskSecret(configValues.account_sid)}</p>
      </div>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Auth Token</Label>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md">{maskSecret(configValues.auth_token)}</p>
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
          value={configValues.messaging_service_sid ? `...${configValues.messaging_service_sid.slice(-8)}` : null}
          success={!!configValues.messaging_service_sid}
        />
        <StatusItem
          label="Webhooks"
          value={configValues.webhooks_configured ? 'Configurados automaticamente' : 'Configuração manual necessária'}
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

      {/* Webhook verification section */}
      <div className="border-t pt-4 space-y-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleCheckWebhooks}
          disabled={checkingWebhooks}
        >
          {checkingWebhooks ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Verificar Webhooks
        </Button>

        {webhookResult && (
          <div className="space-y-3 bg-muted/50 rounded-lg p-3">
            {webhookResult.senders.length > 0 ? (
              webhookResult.senders.map((sender) => (
                <div key={sender.sid} className="space-y-1.5 border-b last:border-b-0 pb-2 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{sender.sender_id.replace('whatsapp:', '')}</span>
                    <Badge variant={sender.status === 'ONLINE' ? 'success' : 'destructive'} size="sm">
                      {sender.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Webhook</span>
                    <div className="flex items-center gap-1">
                      {sender.webhook_correct ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      <span className="text-xs">{sender.webhook_correct ? 'Correto' : 'Incorreto'}</span>
                    </div>
                  </div>
                  {sender.callback_url && (
                    <p className="text-xs text-muted-foreground font-mono truncate" title={sender.callback_url}>
                      {sender.callback_url}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center">Nenhum WhatsApp Sender encontrado</p>
            )}

            {!webhookResult.allCorrect && (
              <Button
                variant="default"
                size="sm"
                className="w-full mt-2"
                onClick={handleFixWebhooks}
                disabled={fixingWebhooks}
              >
                {fixingWebhooks ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4 mr-2" />
                )}
                Corrigir Webhooks
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderGenericConfig = () => {
    const entries = Object.entries(configValues);
    if (entries.length === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma configuração adicional disponível.</p>
      );
    }
    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => (
          <div key={key} className="space-y-2 min-w-0">
            <Label className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</Label>
            <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md break-all overflow-hidden">
              {isSensitiveField(key) ? maskSecret(String(value)) : String(value) || 'Não configurado'}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const isGenericIntegration = integration?.slug !== 'twilio-voice' && integration?.slug !== 'twilio-whatsapp';

  const renderConfigDetails = () => {
    if (isEditing) return renderEditMode();
    if (integration?.slug === 'twilio-voice') return renderTwilioConfig();
    if (integration?.slug === 'twilio-whatsapp') return renderWhatsAppConfig();
    return renderGenericConfig();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancelEditing(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {integration?.logo_url ? (
              <img src={integration.logo_url} alt={integration.name} className="w-10 h-10 rounded-lg object-contain bg-muted p-1" />
            ) : (
              <div className="p-2 rounded-lg bg-muted">
                <Settings2 className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <DialogTitle>{integration?.name}</DialogTitle>
              <DialogDescription>
                {isEditing ? 'Editando configurações' : 'Configurações da integração'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!isEditing && (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground">Status</Label>
                <Badge className="bg-green-500">Conectado</Badge>
              </div>

              {connectedAt && (
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground">Conectado em</Label>
                  <span className="text-sm">{format(new Date(connectedAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                </div>
              )}

              <div className="border-t" />
            </>
          )}

          {isEditing && isGenericIntegration && (
            <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm text-muted-foreground">
              Campos sensíveis (chaves de API, tokens) podem ser deixados em branco para manter o valor atual.
            </div>
          )}

          {renderConfigDetails()}
        </div>

        <div className="flex gap-3 pt-4 border-t">
          {isEditing ? (
            <>
              <Button variant="outline" className="flex-1" onClick={handleCancelEditing} disabled={isSaving}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
            </>
          ) : (
            <>
              {isGenericIntegration && (
                <Button variant="outline" onClick={handleStartEditing}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={onReconfigure}>
                Reconfigurar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={onDisconnect}>
                Desconectar
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
