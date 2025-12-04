import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from '@/lib/i18n';
import { useOrganization } from '@/hooks/useOrganization';
import { MessageSquare, Phone, Mail, Webhook, AlertTriangle, Settings } from 'lucide-react';
import { IntegrationConnectDialog } from './IntegrationConnectDialog';
import { IntegrationDetailDialog } from './IntegrationDetailDialog';
import { PhoneNumberSettings } from './PhoneNumberSettings';
import { toast } from 'sonner';

const iconMap: Record<string, any> = {
  whatsapp: MessageSquare,
  telephony: Phone,
  'twilio-voice': Phone,
  email: Mail,
  webhooks: Webhook,
  other: Webhook,
  default: Webhook,
};

export function IntegrationsSettings() {
  const { locale, organization } = useOrganization();
  const { t } = useTranslation(locale as any);
  const queryClient = useQueryClient();
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedOrgIntegration, setSelectedOrgIntegration] = useState<any>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Fetch available integrations
  const { data: availableIntegrations, isLoading: loadingIntegrations } = useQuery({
    queryKey: ['available-integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_integrations')
        .select('*')
        .in('status', ['available', 'beta'])
        .order('sort_order');

      if (error) throw error;
      return data;
    },
  });

  // Fetch organization's connected integrations
  const { data: orgIntegrations, isLoading: loadingOrgIntegrations } = useQuery({
    queryKey: ['organization-integrations', organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*, integration:admin_integrations(*)')
        .eq('organization_id', organization.id);

      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const disconnectMutation = useMutation({
    mutationFn: async (orgIntegrationId: string) => {
      const { error } = await supabase
        .from('organization_integrations')
        .update({ is_enabled: false })
        .eq('id', orgIntegrationId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Integração desconectada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['organization-integrations'] });
      setDetailDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(`Erro ao desconectar: ${error.message}`);
    },
  });

  const getIntegrationStatus = (integrationId: string) => {
    const connection = orgIntegrations?.find(
      (oi) => oi.integration_id === integrationId && oi.is_enabled
    );
    return connection;
  };

  const handleConnect = (integration: any) => {
    setSelectedIntegration(integration);
    setConnectDialogOpen(true);
  };

  const handleConfigure = (integration: any, orgIntegration: any) => {
    setSelectedIntegration(integration);
    setSelectedOrgIntegration(orgIntegration);
    setDetailDialogOpen(true);
  };

  const handleDisconnectClick = (orgIntegrationId: string) => {
    setDisconnectingId(orgIntegrationId);
    setDisconnectConfirmOpen(true);
  };

  const handleDisconnectConfirm = () => {
    if (disconnectingId) {
      disconnectMutation.mutate(disconnectingId);
    }
    setDisconnectConfirmOpen(false);
    setDisconnectingId(null);
  };

  const handleReconfigure = () => {
    setDetailDialogOpen(false);
    setConnectDialogOpen(true);
  };

  const isLoading = loadingIntegrations || loadingOrgIntegrations;

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Integrações Disponíveis</CardTitle>
            <CardDescription>
              Conecte suas ferramentas favoritas ao Seialz
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Carregando integrações...</p>
              </div>
            ) : availableIntegrations && availableIntegrations.length > 0 ? (
              <div className="grid gap-4">
                {availableIntegrations.map((integration) => {
                  const Icon = iconMap[integration.slug] || iconMap[integration.category] || iconMap.default;
                  const connection = getIntegrationStatus(integration.id);
                  const isConnected = !!connection;
                  const isBeta = integration.status === 'beta';

                  return (
                    <div
                      key={integration.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        {integration.logo_url ? (
                          <img
                            src={integration.logo_url}
                            alt={integration.name}
                            className="w-12 h-12 rounded-lg object-contain bg-muted p-1"
                          />
                        ) : (
                          <div className="p-3 rounded-lg bg-muted">
                            <Icon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{integration.name}</h3>
                            {isBeta && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      Beta
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      Esta integração está em fase beta e pode apresentar comportamentos instáveis.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {integration.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isConnected ? (
                          <>
                            <Badge className="bg-green-500">Conectado</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfigure(integration, connection)}
                            >
                              <Settings className="h-4 w-4 mr-2" />
                              Configurar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Badge variant="secondary">Não conectado</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConnect(integration)}
                            >
                              Conectar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhuma integração disponível no momento.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phone Number Settings - only show if org has telephony integration */}
        {orgIntegrations?.some(oi => oi.is_enabled && oi.integration?.category === 'telephony') && (
          <PhoneNumberSettings />
        )}
      </div>

      {selectedIntegration && (
        <IntegrationConnectDialog
          open={connectDialogOpen}
          onOpenChange={setConnectDialogOpen}
          integration={selectedIntegration}
        />
      )}

      {selectedIntegration && selectedOrgIntegration && (
        <IntegrationDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          integration={selectedIntegration}
          orgIntegration={selectedOrgIntegration}
          onDisconnect={() => handleDisconnectClick(selectedOrgIntegration.id)}
          onReconfigure={handleReconfigure}
        />
      )}

      <ConfirmDialog
        open={disconnectConfirmOpen}
        onOpenChange={setDisconnectConfirmOpen}
        title="Desconectar Integração"
        description="Tem certeza que deseja desconectar esta integração? Você precisará configurá-la novamente para usá-la."
        confirmText="Desconectar"
        variant="destructive"
        onConfirm={handleDisconnectConfirm}
        loading={disconnectMutation.isPending}
      />
    </>
  );
}
