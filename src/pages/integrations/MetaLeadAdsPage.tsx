import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ArrowsClockwise, CheckCircle, Plug, Warning, Gear } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ConnectionForm } from "@/components/integrations/meta-lead-ads/ConnectionForm";
import { PagesAndFormsList } from "@/components/integrations/meta-lead-ads/PagesAndFormsList";
import { MappingDrawer } from "@/components/integrations/meta-lead-ads/MappingDrawer";
import { SettingsCard } from "@/components/integrations/meta-lead-ads/SettingsCard";
import { StatusDashboard } from "@/components/integrations/meta-lead-ads/StatusDashboard";

export default function MetaLeadAdsPage() {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mappingFormId, setMappingFormId] = useState<string | null>(null);

  const { data: integration } = useQuery({
    queryKey: ["admin-integration", "meta-lead-ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_integrations")
        .select("id, name, slug, description, logo_url")
        .eq("slug", "meta-lead-ads")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: orgIntegration, isLoading } = useQuery({
    queryKey: ["org-integration", "meta-lead-ads", organization?.id],
    enabled: !!organization?.id && !!integration?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", organization!.id)
        .eq("integration_id", integration!.id)
        .maybeSingle();
      return data;
    },
  });

  const isConnected = !!orgIntegration?.is_enabled;
  const connectedAccount = (orgIntegration?.connected_account || {}) as any;

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
    },
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings/integrations")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {integration?.logo_url ? (
              <img
                src={integration.logo_url}
                alt={integration.name}
                className="w-14 h-14 rounded-lg object-contain bg-muted p-2"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                <Plug className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold">Meta Lead Ads</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Capture leads de anúncios do Facebook e Instagram automaticamente. Sincronização a cada 3 minutos.
              </p>
              {isConnected && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Conectado
                  </Badge>
                  {connectedAccount.meta_user_name && (
                    <span className="text-xs text-muted-foreground">
                      {connectedAccount.meta_user_name}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {isConnected && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => rediscover.mutate()} disabled={rediscover.isPending}>
                <ArrowsClockwise className={`h-4 w-4 mr-1 ${rediscover.isPending ? "animate-spin" : ""}`} />
                Re-sincronizar
              </Button>
              <Button variant="outline" size="sm" onClick={() => disconnect.mutate()}>
                Desconectar
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !isConnected ? (
          <ConnectionForm
            integrationId={integration?.id}
            existing={orgIntegration}
            onSuccess={() => qc.invalidateQueries({ queryKey: ["org-integration", "meta-lead-ads"] })}
          />
        ) : (
          <>
            <StatusDashboard organizationId={organization!.id} />

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Páginas e Formulários</h2>
              <PagesAndFormsList
                organizationIntegrationId={orgIntegration.id}
                onConfigureMapping={(formId) => setMappingFormId(formId)}
              />
            </Card>

            <SettingsCard
              orgIntegration={orgIntegration}
              onUpdated={() => qc.invalidateQueries({ queryKey: ["org-integration", "meta-lead-ads"] })}
            />
          </>
        )}

        <MappingDrawer
          leadFormId={mappingFormId}
          open={!!mappingFormId}
          onClose={() => setMappingFormId(null)}
          organizationId={organization?.id}
        />
      </div>
    </Layout>
  );
}
