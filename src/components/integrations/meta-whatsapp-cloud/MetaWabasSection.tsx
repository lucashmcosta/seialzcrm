// PR1-B: Lista de todas as WABAs conectadas à organização.
// Cada WABA mostra display_name + waba_id + números (endpoints) aninhados,
// reutilizando MetaAdditionalEndpointsSection para a lista de números.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Buildings, Plus, SpinnerGap } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { MetaAdditionalEndpointsSection } from "./MetaAdditionalEndpointsSection";
import { AddMetaWabaDialog } from "./AddMetaWabaDialog";

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
}

export function MetaWabasSection({ organizationId, metaIntegrationId }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const { data: wabas, isLoading } = useQuery({
    queryKey: ["meta-wabas", organizationId, metaIntegrationId],
    enabled: !!organizationId && !!metaIntegrationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("id, meta_waba_id, display_name, meta_credentials_id, connected_account")
        .eq("organization_id", organizationId)
        .eq("integration_id", metaIntegrationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WabaRow[];
    },
  });

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
              const primaryPnid = (ca.phone_number_id as string | undefined) ?? null;
              const wabaLabel = w.display_name || (w.meta_waba_id ? `WABA ${w.meta_waba_id}` : "WABA (sem ID)");
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
                      </div>
                      {w.meta_waba_id && (
                        <div className="text-[11px] text-muted-foreground font-mono">
                          waba_id {w.meta_waba_id}
                        </div>
                      )}
                    </div>
                  </div>
                  <MetaAdditionalEndpointsSection
                    organizationId={organizationId}
                    organizationIntegrationId={w.id}
                    primaryPhoneNumberId={primaryPnid}
                  />
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
