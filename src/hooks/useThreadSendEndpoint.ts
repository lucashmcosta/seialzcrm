// Resolve o endpoint EFETIVO de envio de uma thread (espelha a Fase 0 do
// dispatcher): se o primary_endpoint_id está ATIVO, usa ele; se está INATIVO
// (número desconectado/rotacionado), resolve o número ATIVO da linha
// (messaging_lines, por purpose) — inclusive cross-provider (Twilio→Meta).
//
// Usado na UI (/messages) para que o composer e o SELETOR DE TEMPLATES usem o
// mesmo número/provider que o envio de fato vai usar — senão o seletor mostra
// templates da WABA errada (ou do provider errado) e fica vazio.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ThreadSendEndpoint {
  endpointId: string | null;
  provider: string | null;
  purpose: string | null;
  organizationIntegrationId: string | null;
  /** true quando o primary está inativo e resolvemos pelo número ativo da linha */
  isRotated: boolean;
  primaryEndpointId: string | null;
}

const EMPTY: ThreadSendEndpoint = {
  endpointId: null, provider: null, purpose: null,
  organizationIntegrationId: null, isRotated: false, primaryEndpointId: null,
};

export function useThreadSendEndpoint(threadId?: string | null): ThreadSendEndpoint {
  const { data } = useQuery({
    queryKey: ["thread-send-endpoint", threadId ?? null],
    enabled: !!threadId,
    staleTime: 60_000,
    queryFn: async (): Promise<ThreadSendEndpoint> => {
      const { data: thread } = await supabase
        .from("message_threads")
        .select("primary_endpoint_id, channel")
        .eq("id", threadId as string)
        .maybeSingle();
      const primaryId = (thread as any)?.primary_endpoint_id as string | null;
      if (!primaryId) return EMPTY;

      const { data: prim } = await supabase
        .from("communication_endpoints")
        .select("id, is_active, provider, purpose, organization_integration_id, organization_id")
        .eq("id", primaryId)
        .maybeSingle();
      if (!prim) return { ...EMPTY, primaryEndpointId: primaryId };

      // Primary ATIVO → é o endpoint de envio (comportamento normal).
      if ((prim as any).is_active) {
        return {
          endpointId: (prim as any).id,
          provider: (prim as any).provider ?? null,
          purpose: (prim as any).purpose ?? null,
          organizationIntegrationId: (prim as any).organization_integration_id ?? null,
          isRotated: false,
          primaryEndpointId: primaryId,
        };
      }

      // Primary INATIVO → resolve o número ativo da linha (por purpose).
      const key = (prim as any).purpose === "commercial" ? "commercial" : "customer_service";
      const { data: line } = await supabase
        .from("messaging_lines")
        .select("active_endpoint_id")
        .eq("organization_id", (prim as any).organization_id)
        .eq("key", key)
        .eq("channel", (thread as any)?.channel ?? "whatsapp")
        .maybeSingle();
      const activeId = (line as any)?.active_endpoint_id as string | null;
      if (!activeId) return { ...EMPTY, purpose: (prim as any).purpose ?? null, primaryEndpointId: primaryId };

      const { data: act } = await supabase
        .from("communication_endpoints")
        .select("id, is_active, provider, purpose, organization_integration_id")
        .eq("id", activeId)
        .maybeSingle();
      if (!act || !(act as any).is_active) {
        return { ...EMPTY, purpose: (prim as any).purpose ?? null, primaryEndpointId: primaryId };
      }
      return {
        endpointId: (act as any).id,
        provider: (act as any).provider ?? null,
        purpose: (act as any).purpose ?? null,
        organizationIntegrationId: (act as any).organization_integration_id ?? null,
        isRotated: true,
        primaryEndpointId: primaryId,
      };
    },
  });
  return data ?? EMPTY;
}
