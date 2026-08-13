// ============================================================================
// Fase 3 — camada provider-agnostic do WhatsApp Comercial.
//
// Separação obrigatória de conceitos:
//   INTEGRAÇÃO  = conexão técnica com o provedor (credenciais, instância).
//   CONFIGURAÇÃO = recursos do tenant (endpoints, vínculo com a Route).
//   REGRA        = comportamento de negócio (Route ativa, resolver V2).
//
// Este módulo descreve APENAS capacidades técnicas por provedor. Não guarda
// credenciais, não infere números e não decide regra de negócio.
// ============================================================================

export type SalesProvider = "meta" | "twilio" | "evolution";

export const SALES_PROVIDERS: SalesProvider[] = ["meta", "twilio", "evolution"];

/** Famílias aceitas em `communication_endpoints.provider` por provedor. */
export const PROVIDER_FAMILY: Record<SalesProvider, string[]> = {
  meta: ["meta_cloud_api", "meta_cloud_api_coexistence", "meta-cloud"],
  twilio: ["twilio"],
  evolution: ["evolution_api"],
};

export interface ProviderCapabilities {
  /** Aceita QR code / pareamento por sessão (Evolution). */
  qrPairing: boolean;
  /** Permite reiniciar a sessão técnica (logout + connect). */
  restart: boolean;
  /** O provedor expõe a identidade real do número da sessão. */
  reportsOwnerIdentity: boolean;
  /** O número é provisionado fora do CRM (console do provedor). */
  numberProvisionedUpstream: boolean;
  /** Envio fora da janela de 24h exige template aprovado. */
  requiresTemplateOutsideWindow: boolean;
}

export const CAPABILITIES: Record<SalesProvider, ProviderCapabilities> = {
  meta: {
    qrPairing: false,
    restart: false,
    reportsOwnerIdentity: false,
    numberProvisionedUpstream: true,
    requiresTemplateOutsideWindow: true,
  },
  twilio: {
    qrPairing: false,
    restart: false,
    reportsOwnerIdentity: false,
    numberProvisionedUpstream: true,
    requiresTemplateOutsideWindow: true,
  },
  evolution: {
    qrPairing: true,
    restart: true,
    reportsOwnerIdentity: true,
    numberProvisionedUpstream: false,
    requiresTemplateOutsideWindow: false,
  },
};

export function normalizeProvider(input: unknown): SalesProvider | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (v === "meta" || v === "twilio" || v === "evolution") return v;
  return null;
}

/** Deriva o provedor lógico a partir do valor persistido no endpoint. */
export function providerFromEndpoint(value: unknown): SalesProvider | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  for (const p of SALES_PROVIDERS) {
    if (PROVIDER_FAMILY[p].includes(v)) return p;
  }
  return null;
}

/** Somente dígitos. Nunca usado para inferir identidade, apenas comparar. */
export function digitsOf(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "");
}
