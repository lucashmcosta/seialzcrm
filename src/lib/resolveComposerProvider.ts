// Resolve qual provider o composer deve usar para LISTAR templates,
// antecipando a regra de re-rota lazy do dispatcher (Twilio → Meta 7020)
// para a Central Trabalhista na tela /messages.
//
// Não persiste nada. Não altera threads/endpoints. Apenas decide a UI
// de seleção de templates para destravar o envio inicial em threads
// cuja primary_endpoint_id ainda aponta para Twilio.

export const REROUTE_ORG_ID = "40ae935c-a7f7-4ad7-8ea4-91be6404a95f";

type Provider = "twilio" | "meta_cloud_api";

interface Args {
  organizationId?: string | null;
  senderContext?: string | null;
  resolvedProvider: Provider | null;
}

export function resolveComposerProvider({
  organizationId,
  senderContext,
  resolvedProvider,
}: Args): Provider | null {
  const isRerouteTarget =
    senderContext === "messages" &&
    organizationId === REROUTE_ORG_ID &&
    (resolvedProvider === "twilio" || resolvedProvider == null);

  if (isRerouteTarget) return "meta_cloud_api";
  return resolvedProvider;
}
