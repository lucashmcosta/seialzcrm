// PR1-B: Lista de todas as WABAs conectadas à organização.
// Cada WABA mostra display_name + waba_id + números (endpoints) aninhados,
// reutilizando MetaAdditionalEndpointsSection para a lista de números.
// PR2 (P0 webhook): botão "Reinscrever webhook" por WABA + badge de estado.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Buildings, Plus, SpinnerGap, ArrowClockwise, CheckCircle, Warning, ArrowsClockwise } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { metaWhatsAppService } from "@/services/metaWhatsAppService";
import { MetaAdditionalEndpointsSection } from "./MetaAdditionalEndpointsSection";
import { AddMetaWabaDialog } from "./AddMetaWabaDialog";
import { WhatsAppInboundSettings } from "@/components/settings/WhatsAppInboundSettings";


interface Props {
  organizationId: string;
  /** ID da integração Meta WhatsApp Cloud (admin_integrations.slug='meta-whatsapp-cloud'). */
  metaIntegrationId: string;
}

interface WabaRow {
  id: string;
  meta_waba_id: string | null;
  display_name: string | null;
  meta_credentials_id: string | null;
  connected_account: Record<string, unknown> | null;
  config_values: Record<string, unknown> | null;
  whatsapp_inbound_settings: Record<string, unknown> | null;
}


export function MetaWabasSection({ organizationId, metaIntegrationId }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [resubscribingId, setResubscribingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: wabas, isLoading } = useQuery({
    queryKey: ["meta-wabas", organizationId, metaIntegrationId],
    enabled: !!organizationId && !!metaIntegrationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("id, meta_waba_id, display_name, meta_credentials_id, connected_account, config_values, whatsapp_inbound_settings")
        .eq("organization_id", organizationId)
        .eq("integration_id", metaIntegrationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WabaRow[];
    },
  });

  async function handleResubscribe(oiId: string) {
    setResubscribingId(oiId);
    try {
      const res = await metaWhatsAppService.resubscribeWebhook({
        organizationId,
        organizationIntegrationId: oiId,
      });
      toast({
        title: "Webhook reinscrito",
        description: `App(s) inscrito(s): ${res.subscribed_app_ids.join(", ") || "—"}`,
      });
      await queryClient.invalidateQueries({
        queryKey: ["meta-wabas", organizationId, metaIntegrationId],
      });
    } catch (e) {
      const err = e as Error & { code?: string; details?: unknown };
      toast({
        variant: "destructive",
        title: "Falha ao reinscrever webhook",
        description:
          err.code === "waba_subscribe_failed"
            ? "A Meta recusou a inscrição do app. Verifique permissões do token."
            : err.message,
      });
    } finally {
      setResubscribingId(null);
    }
  }

  async function handleSyncTemplates(oiId: string) {
    setSyncingId(oiId);
    try {
      const res = await metaWhatsAppService.syncTemplates({
        organizationId,
        organizationIntegrationId: oiId,
      });
      toast({
        title: "Templates sincronizados",
        description: `${res.synced}/${res.total} templates (aprovados: ${res.approved ?? 0}).`,
      });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    } catch (e) {
      const err = e as Error & { code?: string };
      toast({
        variant: "destructive",
        title: "Falha ao sincronizar templates",
        description: err.message,
      });
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-medium flex items-center gap-2">
              <Buildings className="h-4 w-4" />
              WABAs conectadas
            </h4>
            <p className="text-xs text-muted-foreground">
              Uma organização pode ter múltiplas WABAs compartilhando as mesmas credenciais Meta
              (app_id, token, app_secret).
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar WABA
          </Button>
        </div>

        <Separator />

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (wabas ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma WABA cadastrada ainda.</p>
        ) : (
          <div className="space-y-3">
            {(wabas ?? []).map((w) => {
              const ca = (w.connected_account ?? {}) as Record<string, unknown>;
              const cv = (w.config_values ?? {}) as Record<string, unknown>;
              const primaryPnid = (ca.phone_number_id as string | undefined) ?? null;
              const wabaLabel = w.display_name || (w.meta_waba_id ? `WABA ${w.meta_waba_id}` : "WABA (sem ID)");
              const subscribed = cv.webhook_subscribed === true;
              const subscribedAt = typeof cv.webhook_subscribed_at === "string" ? cv.webhook_subscribed_at : null;
              const busy = resubscribingId === w.id;
              const syncing = syncingId === w.id;
              return (
                <div key={w.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{wabaLabel}</span>
                        {w.meta_credentials_id ? (
                          <Badge variant="secondary" className="text-[10px]">creds compartilhadas</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">legado</Badge>
                        )}
                        {subscribed ? (
                          <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> webhook inscrito
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] flex items-center gap-1 text-amber-600 border-amber-400">
                            <Warning className="h-3 w-3" /> webhook não inscrito
                          </Badge>
                        )}
                      </div>
                      {w.meta_waba_id && (
                        <div className="text-[11px] text-muted-foreground font-mono">
                          waba_id {w.meta_waba_id}
                        </div>
                      )}
                      {subscribedAt && (
                        <div className="text-[10px] text-muted-foreground">
                          inscrito em {new Date(subscribedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={syncing || !w.meta_waba_id}
                        onClick={() => handleSyncTemplates(w.id)}
                      >
                        {syncing ? (
                          <SpinnerGap className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <ArrowsClockwise className="h-3.5 w-3.5 mr-1" />
                        )}
                        Sincronizar templates
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || !w.meta_waba_id}
                        onClick={() => handleResubscribe(w.id)}
                      >
                        {busy ? (
                          <SpinnerGap className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <ArrowClockwise className="h-3.5 w-3.5 mr-1" />
                        )}
                        Reinscrever webhook
                      </Button>
                    </div>
                  </div>
                  <MetaAdditionalEndpointsSection
                    organizationId={organizationId}
                    organizationIntegrationId={w.id}
                    primaryPhoneNumberId={primaryPnid}
                    integrationFallback={w.whatsapp_inbound_settings}
                  />
                  <WhatsAppInboundSettings integrationId={w.id} />
                </div>

              );
            })}
          </div>
        )}
      </Card>

      <AddMetaWabaDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        organizationId={organizationId}
      />
    </>
  );
}
