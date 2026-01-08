import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from '@/lib/i18n';
import { useOrganization } from '@/hooks/useOrganization';
import { MessageSquare, Phone, Mail, Webhook, AlertTriangle, Plus } from 'lucide-react';
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

const categories = [
  { id: 'all', label: 'Ver todos' },
  { id: 'telephony', label: 'Telefonia' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'webhooks', label: 'Webhooks' },
];

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
  const [selectedCategory, setSelectedCategory] = useState('all');

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

  // Filter integrations by category
  const filteredIntegrations = useMemo(() => {
    if (!availableIntegrations) return [];
    if (selectedCategory === 'all') return availableIntegrations;
    return availableIntegrations.filter(
      (integration) => integration.category === selectedCategory || integration.slug === selectedCategory
    );
  }, [availableIntegrations, selectedCategory]);

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

  const toggleMutation = useMutation({
    mutationFn: async ({ orgIntegrationId, enabled }: { orgIntegrationId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('organization_integrations')
        .update({ is_enabled: enabled })
        .eq('id', orgIntegrationId);

      if (error) throw error;
    },
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? 'Integração ativada!' : 'Integração desativada!');
      queryClient.invalidateQueries({ queryKey: ['organization-integrations'] });
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const getIntegrationStatus = (integrationId: string) => {
    const connection = orgIntegrations?.find(
      (oi) => oi.integration_id === integrationId
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

  const handleToggle = (integration: any, orgIntegration: any, newState: boolean) => {
    if (orgIntegration) {
      toggleMutation.mutate({ orgIntegrationId: orgIntegration.id, enabled: newState });
    } else if (newState) {
      // If toggling on and not connected, open connect dialog
      handleConnect(integration);
    }
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('settings.integrationsTitle') || 'Integrações e apps conectados'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t('settings.integrationsDescription') || 'Potencialize seu workflow conectando ferramentas do dia a dia.'}
            </p>
          </div>
          <Button variant="outline" className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.requestIntegration') || 'Solicitar integração'}
          </Button>
        </div>

        {/* Category Filter */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList variant="pills" className="flex-wrap">
            {categories.map((category) => (
              <TabsTrigger key={category.id} value={category.id} variant="pills">
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Integrations Grid */}
        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Carregando integrações...</p>
          </div>
        ) : filteredIntegrations && filteredIntegrations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIntegrations.map((integration) => {
              const Icon = iconMap[integration.slug] || iconMap[integration.category] || iconMap.default;
              const connection = getIntegrationStatus(integration.id);
              const isConnected = !!connection?.is_enabled;
              const isBeta = integration.status === 'beta';

              return (
                <Card key={integration.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {integration.logo_url ? (
                        <img
                          src={integration.logo_url}
                          alt={integration.name}
                          className="w-10 h-10 rounded-lg object-contain bg-muted p-1 shrink-0"
                        />
                      ) : (
                        <div className="p-2 rounded-lg bg-muted shrink-0">
                          <Icon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-foreground truncate">{integration.name}</h3>
                          {isBeta && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="flex items-center gap-1 shrink-0">
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
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {integration.description}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isConnected}
                      onCheckedChange={(checked) => handleToggle(integration, connection, checked)}
                      disabled={toggleMutation.isPending}
                    />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-primary"
                      onClick={() => {
                        if (connection) {
                          handleConfigure(integration, connection);
                        } else {
                          handleConnect(integration);
                        }
                      }}
                    >
                      {t('settings.viewIntegration') || 'Ver integração'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Nenhuma integração encontrada nesta categoria.</p>
          </div>
        )}

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
