// Lista todos os endpoints Meta Cloud da org que NÃO são o "principal"
// (i.e. cujo sender_sid difere do phone_number_id armazenado em
// organization_integrations.connected_account.phone_number_id).
//
// READ-ONLY por contrato desta etapa: nenhum botão de editar/remover/desativar.
// Endpoints pré-existentes (ex.: +16893077491) aparecem aqui marcados como
// "não gerenciado por esta tela".
import { useQuery } from "@tanstack/react-query";
import { Phone, SpinnerGap } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatPhoneDisplay } from "@/lib/phoneUtils";

interface Props {
  organizationId: string;
  organizationIntegrationId: string;
  primaryPhoneNumberId?: string | null;
}

export function MetaAdditionalEndpointsSection({
  organizationId,
  organizationIntegrationId,
  primaryPhoneNumberId,
}: Props) {
  const { data: endpoints, isLoading } = useQuery({
    queryKey: ["meta-additional-endpoints", organizationId, organizationIntegrationId],
    enabled: !!organizationId && !!organizationIntegrationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_endpoints")
        .select("id, external_address, display_name, is_active, status, sender_sid, purpose, created_at")
        .eq("organization_id", organizationId)
        .eq("organization_integration_id", organizationIntegrationId)
        .eq("provider", "meta_cloud_api")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const additional = (endpoints || []).filter(
    (ep) => !primaryPhoneNumberId || ep.sender_sid !== primaryPhoneNumberId,
  );

  if (additional.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum número adicional cadastrado nesta WABA.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">
        Números adicionais ({additional.length})
      </Label>
      {additional.map((ep) => {
        const formatted = formatPhoneDisplay(ep.external_address) || ep.external_address;
        const purposeLabel =
          ep.purpose === "commercial" ? "Comercial"
          : ep.purpose === "customer_service" ? "Atendimento"
          : ep.purpose === "vendor_personal" ? "Pessoal"
          : "Outro";
        return (
          <div
            key={ep.id}
            className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm"
          >
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{formatted}</span>
                {ep.display_name && (
                  <span className="text-xs text-muted-foreground truncate">
                    — {ep.display_name}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                pid …{String(ep.sender_sid || "").slice(-8)}
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {purposeLabel}
            </Badge>
            <Badge
              variant={ep.is_active ? (ep.status === "online" ? "default" : "secondary") : "outline"}
              className="text-[10px]"
            >
              {ep.is_active ? (ep.status || "ativo") : "inativo"}
            </Badge>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground italic">
        Endpoints existentes não são editáveis por esta tela. Para alterar, use o gerenciamento direto do banco.
      </p>
    </div>
  );
}
