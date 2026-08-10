import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowsClockwise, CheckCircle, Plug } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ConnectionForm } from "./ConnectionForm";
import { PagesAndFormsList } from "./PagesAndFormsList";
import { MappingDrawer } from "./MappingDrawer";
import { SettingsCard } from "./SettingsCard";
import { StatusDashboard } from "./StatusDashboard";
import { useMetaConnection } from "@/hooks/useMetaConnection";
import { useOrgIntegration } from "@/hooks/useOrgIntegration";
import { MetaConnectionBanner } from "@/components/integrations/meta/MetaConnectionBanner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  orgIntegration: any;
  onManageConnection?: () => void;
  // 'inline' renderiza como seção de largura total (dentro da página Meta);
  // 'modal' mantém o diálogo antigo. Default: modal (compat).
  variant?: "modal" | "inline";
}

export function MetaLeadAdsDialog({
  open,
  onOpenChange,
  integration,
  orgIntegration: initialOrgIntegration,
  onManageConnection,
  variant = "modal",
}: Props) {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const [tab, setTab] = useState("forms");
  const [mappingFormId, setMappingFormId] = useState<string | null>(null);

  // Resolução robusta da linha organization_integrations (ver useOrgIntegration).
  const { data: orgIntegration } = useOrgIntegration(
    organization?.id,
    integration?.id,
    initialOrgIntegration,
  );

  // Espelha a decisão do backend: credencial canônica ativa (flag + Meta Connection)
  // conta como conectado, mesmo antes de a UI legada refletir isso.
  const { canonicalActive } = useMetaConnection(organization?.id);
  const isConnected = canonicalActive || !!orgIntegration?.is_enabled;
  const ca = (orgIntegration?.connected_account || {}) as any;

  useEffect(() => {
    if (open) setTab(isConnected ? "forms" : "connection");
  }, [open, isConnected]);

  const rediscover = useMutation({
    mutationFn: async () => {
      if (!orgIntegration?.id) throw new Error("Não conectado");
      const { error } = await supabase.functions.invoke("meta-lead-ads-discover", {
        body: { organization_integration_id: orgIntegration.id, organization_id: organization!.id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sincronização iniciada");
      qc.invalidateQueries({ queryKey: ["meta-lead-pages"] });
      qc.invalidateQueries({ queryKey: ["lead-forms"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao sincronizar"),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!orgIntegration?.id) return;
      const { error } = await supabase
        .from("organization_integrations")
        .update({ is_enabled: false })
        .eq("id", orgIntegration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Integração desativada");
      qc.invalidateQueries({ queryKey: ["org-integration-v2"] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
    },
  });

  const refetchOrg = () => qc.invalidateQueries({ queryKey: ["org-integration-v2"] });

  const logo = integration?.logo_url ? (
    <img
      src={integration.logo_url}
      alt={integration.name}
      className="w-12 h-12 rounded-lg object-contain bg-muted p-2 shrink-0"
    />
  ) : (
    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
      <Plug className="h-6 w-6 text-muted-foreground" />
    </div>
  );

  const statusBadges = (
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      {isConnected ? (
        <Badge variant="outline" className="gap-1">
          <CheckCircle className="h-3 w-3 text-green-500" />
          Conectado
        </Badge>
      ) : (
        <Badge variant="secondary">Desconectado</Badge>
      )}
      {ca.meta_user_name && (
        <span className="text-xs text-muted-foreground">{ca.meta_user_name}</span>
      )}
    </div>
  );

  const actions = isConnected ? (
    <div className="flex gap-2 shrink-0">
      <Button
        variant="outline"
        size="sm"
        onClick={() => rediscover.mutate()}
        disabled={rediscover.isPending}
      >
        <ArrowsClockwise className={`h-4 w-4 mr-1 ${rediscover.isPending ? "animate-spin" : ""}`} />
        Re-sincronizar
      </Button>
      <Button variant="outline" size="sm" onClick={() => disconnect.mutate()}>
        Desconectar
      </Button>
    </div>
  ) : null;

  const banner = canonicalActive ? <MetaConnectionBanner onManage={onManageConnection} /> : null;

  const tabsBlock = (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className={`grid w-full ${canonicalActive ? "grid-cols-3" : "grid-cols-4"}`}>
        {!canonicalActive && <TabsTrigger value="connection">Conexão</TabsTrigger>}
        <TabsTrigger value="forms" disabled={!isConnected}>
          Formulários
        </TabsTrigger>
        <TabsTrigger value="settings" disabled={!isConnected}>
          Configurações
        </TabsTrigger>
        <TabsTrigger value="status" disabled={!isConnected}>
          Status
        </TabsTrigger>
      </TabsList>

      {!canonicalActive && (
        <TabsContent value="connection" className="mt-4">
          <ConnectionForm
            integrationId={integration?.id}
            existing={orgIntegration}
            onSuccess={refetchOrg}
          />
        </TabsContent>
      )}

      <TabsContent value="forms" className="mt-4">
        {isConnected && orgIntegration && (
          <Card className="p-4 sm:p-6">
            <h3 className="text-base font-semibold mb-4">Páginas e Formulários</h3>
            <PagesAndFormsList
              organizationIntegrationId={orgIntegration.id}
              onConfigureMapping={(formId) => setMappingFormId(formId)}
              hideLegacyExpiredBadge={canonicalActive}
            />
          </Card>
        )}
      </TabsContent>

      <TabsContent value="settings" className="mt-4">
        {isConnected && orgIntegration && (
          <SettingsCard orgIntegration={orgIntegration} onUpdated={refetchOrg} />
        )}
      </TabsContent>

      <TabsContent value="status" className="mt-4">
        {isConnected && organization?.id && <StatusDashboard organizationId={organization.id} />}
      </TabsContent>
    </Tabs>
  );

  if (variant === "inline") {
    return (
      <>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              {logo}
              <div>
                <h2 className="text-xl font-semibold">Meta Lead Ads</h2>
                {statusBadges}
              </div>
            </div>
            {actions}
          </div>
          {banner}
          {tabsBlock}
        </div>

        <MappingDrawer
          leadFormId={mappingFormId}
          open={!!mappingFormId}
          onClose={() => setMappingFormId(null)}
          organizationId={organization?.id}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-6">
              <div className="flex items-start gap-3">
                {logo}
                <div>
                  <DialogTitle className="text-xl">Meta Lead Ads</DialogTitle>
                  {statusBadges}
                </div>
              </div>
              {actions}
            </div>
          </DialogHeader>

          {banner && <div className="mt-4">{banner}</div>}
          <div className="mt-4">{tabsBlock}</div>
        </DialogContent>
      </Dialog>

      <MappingDrawer
        leadFormId={mappingFormId}
        open={!!mappingFormId}
        onClose={() => setMappingFormId(null)}
        organizationId={organization?.id}
      />
    </>
  );
}
