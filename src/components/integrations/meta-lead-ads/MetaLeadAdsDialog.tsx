import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  orgIntegration: any;
}

export function MetaLeadAdsDialog({ open, onOpenChange, integration, orgIntegration: initialOrgIntegration }: Props) {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const [tab, setTab] = useState("connection");
  const [mappingFormId, setMappingFormId] = useState<string | null>(null);

  // Always refetch fresh org integration
  const { data: orgIntegration } = useQuery({
    queryKey: ["org-integration", "meta-lead-ads", organization?.id],
    enabled: !!organization?.id && !!integration?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", organization!.id)
        .eq("integration_id", integration!.id)
        .maybeSingle();
      return data;
    },
    initialData: initialOrgIntegration,
  });

  const isConnected = !!orgIntegration?.is_enabled;
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
      qc.invalidateQueries({ queryKey: ["org-integration", "meta-lead-ads"] });
      qc.invalidateQueries({ queryKey: ["organization-integrations"] });
    },
  });

  const refetchOrg = () =>
    qc.invalidateQueries({ queryKey: ["org-integration", "meta-lead-ads"] });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-6">
              <div className="flex items-start gap-3">
                {integration?.logo_url ? (
                  <img
                    src={integration.logo_url}
                    alt={integration.name}
                    className="w-12 h-12 rounded-lg object-contain bg-muted p-2"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <Plug className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <DialogTitle className="text-xl">Meta Lead Ads</DialogTitle>
                  <div className="flex items-center gap-2 mt-1">
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
                </div>
              </div>
              {isConnected && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rediscover.mutate()}
                    disabled={rediscover.isPending}
                  >
                    <ArrowsClockwise
                      className={`h-4 w-4 mr-1 ${rediscover.isPending ? "animate-spin" : ""}`}
                    />
                    Re-sincronizar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => disconnect.mutate()}>
                    Desconectar
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="connection">Conexão</TabsTrigger>
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

            <TabsContent value="connection" className="mt-4">
              <ConnectionForm
                integrationId={integration?.id}
                existing={orgIntegration}
                onSuccess={refetchOrg}
              />
            </TabsContent>

            <TabsContent value="forms" className="mt-4">
              {isConnected && orgIntegration && (
                <Card className="p-6">
                  <h3 className="text-base font-semibold mb-4">Páginas e Formulários</h3>
                  <PagesAndFormsList
                    organizationIntegrationId={orgIntegration.id}
                    onConfigureMapping={(formId) => setMappingFormId(formId)}
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
              {isConnected && organization?.id && (
                <StatusDashboard organizationId={organization.id} />
              )}
            </TabsContent>
          </Tabs>
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
