// Resolve qual provider o composer deve usar para LISTAR templates,
// antecipando a regra de re-rota lazy do dispatcher (Twilio → Meta 7020)
// para a Central Trabalhista na tela /messages.
//
// Não persiste nada. Não altera threads/endpoints. Apenas decide a UI
// de seleção de templates para destravar o envio inicial em threads
// cuja primary_endpoint_id ainda aponta para Twilio.

import { isCsPurpose } from "./endpointPurpose";

export const REROUTE_ORG_ID = "40ae935c-a7f7-4ad7-8ea4-91be6404a95f";

type Provider = "twilio" | "meta_cloud_api" | "evolution_api";

interface Args {
  organizationId?: string | null;
  senderContext?: string | null;
  resolvedProvider: Provider | null;
  /**
   * message_threads.business_context da thread selecionada. Quando
   * `sales`, força Meta em /messages caso o endpoint atual da thread
   * ainda seja customer_service (regra do PR4, sem hardcode de org).
   */
  businessContext?: "sales" | "customer_service" | "other" | null;
  /**
   * `communication_endpoints.purpose` do primary_endpoint_id da thread.
   * Usado junto com businessContext para o novo critério.
   */
  threadPrimaryPurpose?: string | null;
}

export function resolveComposerProvider({
  organizationId,
  senderContext,
  resolvedProvider,
  businessContext,
  threadPrimaryPurpose,
}: Args): Provider | null {
  // Nova regra genérica (PR4):
  // /messages + business_context='sales' + endpoint atual é atendimento
  // → o send será re-rotado para Meta pelo dispatcher; alinhar UI de templates.
  const salesMismatch =
    senderContext === "messages" &&
    businessContext === "sales" &&
    isCsPurpose(threadPrimaryPurpose);

  // Fallback legado (Central Trabalhista) — mantido até PR5.
  const legacyCentralTrabalhista =
    senderContext === "messages" &&
    organizationId === REROUTE_ORG_ID &&
    (resolvedProvider === "twilio" || resolvedProvider == null);

  if (salesMismatch || legacyCentralTrabalhista) return "meta_cloud_api";
  return resolvedProvider;
}
