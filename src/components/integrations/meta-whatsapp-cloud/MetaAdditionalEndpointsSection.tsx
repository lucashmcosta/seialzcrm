// Lista todos os endpoints Meta Cloud da org (incluindo o principal),
// permitindo alterar o "purpose" (destino de roteamento: /inbox ou /messages)
// inline, direto na UI.
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Phone, SpinnerGap } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatPhoneDisplay } from "@/lib/phoneUtils";

interface Props {
  organizationId: string;
  organizationIntegrationId: string;
  primaryPhoneNumberId?: string | null;
}

type Purpose = "customer_service" | "commercial" | "vendor_personal" | "other";

const PURPOSE_ROUTE: Record<Purpose, string> = {
  customer_service: "/inbox",
  commercial: "/messages",
  vendor_personal: "/messages",
  other: "—",
};

export function MetaAdditionalEndpointsSection({
  organizationId,
  organizationIntegrationId,
  primaryPhoneNumberId,
}: Props) {
  const qc = useQueryClient();
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

  const updatePurpose = useMutation({
    mutationFn: async ({ id, purpose }: { id: string; purpose: Purpose }) => {
      const { error } = await supabase
        .from("communication_endpoints")
        .update({ purpose })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.purpose === "commercial"
          ? "Número roteado para /messages"
          : vars.purpose === "customer_service"
          ? "Número roteado para /inbox"
          : "Destino atualizado",
      );
      qc.invalidateQueries({ queryKey: ["meta-additional-endpoints"] });
      qc.invalidateQueries({ queryKey: ["org-whatsapp-endpoints"] });
    },
    onError: (e: any) => toast.error(`Falha ao atualizar: ${e?.message ?? e}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const all = endpoints || [];

  if (all.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum número cadastrado nesta WABA.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">
        Números desta WABA ({all.length})
      </Label>
      {all.map((ep) => {
        const formatted = formatPhoneDisplay(ep.external_address) || ep.external_address;
        const isPrimary = primaryPhoneNumberId && ep.sender_sid === primaryPhoneNumberId;
        const currentPurpose = (ep.purpose ?? "customer_service") as Purpose;
        return (
          <div
            key={ep.id}
            className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm"
          >
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{formatted}</span>
                {isPrimary && (
                  <Badge variant="secondary" className="text-[10px]">principal</Badge>
                )}
                {ep.display_name && (
                  <span className="text-xs text-muted-foreground truncate">
                    — {ep.display_name}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                pid …{String(ep.sender_sid || "").slice(-8)} · destino {PURPOSE_ROUTE[currentPurpose]}
              </div>
            </div>
            <Select
              value={currentPurpose}
              disabled={updatePurpose.isPending}
              onValueChange={(v) =>
                updatePurpose.mutate({ id: ep.id, purpose: v as Purpose })
              }
            >
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer_service">Atendimento (/inbox)</SelectItem>
                <SelectItem value="commercial">Comercial (/messages)</SelectItem>
                <SelectItem value="vendor_personal">Pessoal (/messages)</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
            <Badge
              variant={ep.is_active ? (ep.status === "online" ? "default" : "secondary") : "outline"}
              className="text-[10px]"
            >
              {ep.is_active ? (ep.status || "ativo") : "inativo"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
