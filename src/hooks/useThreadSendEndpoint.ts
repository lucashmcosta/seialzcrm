// Resolve o endpoint EFETIVO de envio de uma thread.
//
// Regra (restaurada): o histórico da thread é imutável, mas o **número de envio**
// é sempre resolvido em runtime pela **linha ativa do purpose**
// (`messaging_lines.active_endpoint_id`). Isso permite trocar de provider
// (Twilio ↔ Meta ↔ Evolution) sem migrar threads manualmente.
//
// Ordem de resolução:
//   1. Se a thread tem `primary_endpoint_id` com `purpose` conhecido, busca a
//      linha da org para aquele purpose (commercial / customer_service).
//   2. Se a linha existe e `active_endpoint_id` está `is_active=true`, esse é
//      o endpoint de envio. `isRotated=true` quando diferir do primary.
//   3. Fallback: usa o próprio `primary_endpoint_id` se ainda estiver ativo.
//   4. Caso contrário, retorna vazio — UI deve bloquear com mensagem clara.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ThreadSendEndpoint {
  endpointId: string | null;
  provider: string | null;
  purpose: string | null;
  organizationIntegrationId: string | null;
  /** true quando o endpoint efetivo difere do primary_endpoint_id da thread */
  isRotated: boolean;
  primaryEndpointId: string | null;
}

const EMPTY: ThreadSendEndpoint = {
  endpointId: null, provider: null, purpose: null,
  organizationIntegrationId: null, isRotated: false, primaryEndpointId: null,
};

function purposeToLineKey(purpose: string | null | undefined): "commercial" | "customer_service" | null {
  if (purpose === "commercial" || purpose === "vendor_personal") return "commercial";
  if (purpose === "customer_service" || purpose === "support" || purpose === "other") return "customer_service";
  return null;
}

export function useThreadSendEndpoint(threadId?: string | null): ThreadSendEndpoint {
  const { data } = useQuery({
    queryKey: ["thread-send-endpoint", threadId ?? null],
    enabled: !!threadId,
    staleTime: 60_000,
    queryFn: async (): Promise<ThreadSendEndpoint> => {
      const { data: thread } = await supabase
        .from("message_threads")
        .select("primary_endpoint_id, channel, business_context, organization_id")
        .eq("id", threadId as string)
        .maybeSingle();
      const primaryId = (thread as any)?.primary_endpoint_id as string | null;
      const channel = (thread as any)?.channel ?? "whatsapp";
      const orgId = (thread as any)?.organization_id as string | null;
      const businessContext = (thread as any)?.business_context as string | null;

      // Descobre o purpose de referência: prefere o do primary; se ausente,
      // deriva do business_context (sales→commercial, support/CS→cs).
      let refPurpose: string | null = null;
      let primary: any | null = null;
      if (primaryId) {
        const { data: prim } = await supabase
          .from("communication_endpoints")
          .select("id, is_active, provider, purpose, organization_integration_id, organization_id")
          .eq("id", primaryId)
          .maybeSingle();
        primary = prim ?? null;
        refPurpose = (prim as any)?.purpose ?? null;
      }
      if (!refPurpose) {
        refPurpose = businessContext === "sales" ? "commercial" : "customer_service";
      }

      const lineKey = purposeToLineKey(refPurpose);
      if (orgId && lineKey) {
        const { data: line } = await supabase
          .from("messaging_lines")
          .select("active_endpoint_id")
          .eq("organization_id", orgId)
          .eq("key", lineKey)
          .eq("channel", channel)
          .maybeSingle();
        const activeId = (line as any)?.active_endpoint_id as string | null;
        if (activeId) {
          const { data: act } = await supabase
            .from("communication_endpoints")
            .select("id, is_active, provider, purpose, organization_integration_id")
            .eq("id", activeId)
            .maybeSingle();
          if (act && (act as any).is_active) {
            return {
              endpointId: (act as any).id,
              provider: (act as any).provider ?? null,
              purpose: (act as any).purpose ?? null,
              organizationIntegrationId: (act as any).organization_integration_id ?? null,
              isRotated: !!primaryId && (act as any).id !== primaryId,
              primaryEndpointId: primaryId,
            };
          }
        }
      }

      // Fallback: primary ainda ativo → usa ele.
      if (primary && primary.is_active) {
        return {
          endpointId: primary.id,
          provider: primary.provider ?? null,
          purpose: primary.purpose ?? null,
          organizationIntegrationId: primary.organization_integration_id ?? null,
          isRotated: false,
          primaryEndpointId: primaryId,
        };
      }

      return { ...EMPTY, purpose: refPurpose, primaryEndpointId: primaryId };
    },
  });
  return data ?? EMPTY;
}
