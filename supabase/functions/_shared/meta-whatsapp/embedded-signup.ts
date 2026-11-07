// Regras puras do WhatsApp Embedded Signup (v4) — sem I/O, testáveis em Deno.
// A edge function `meta-whatsapp-embedded-signup` faz as chamadas; aqui ficam as
// decisões: quais ativos o token realmente autoriza, qual WABA/número usar e se
// a gravação é inserir, re-autorizar ou recusar por conflito.

export const EMBEDDED_SOURCE = "embedded_signup";

/** IDs de WABA que o token autoriza (granular_scopes do debug_token). */
export function wabaIdsFromGranularScopes(granular: unknown): string[] {
  if (!Array.isArray(granular)) return [];
  const ids = new Set<string>();
  for (const g of granular) {
    // target_ids de whatsapp_business_management = WABAs (os de _messaging são números).
    if ((g as { scope?: unknown })?.scope !== "whatsapp_business_management") continue;
    const targets = (g as { target_ids?: unknown })?.target_ids;
    if (!Array.isArray(targets)) continue;
    for (const t of targets) if (t != null && String(t)) ids.add(String(t));
  }
  return [...ids];
}

export type AssetResolution =
  | { ok: true; wabaId: string; phoneNumberId: string }
  | { ok: false; error: "no_waba_granted" | "waba_not_granted" | "multiple_wabas" | "no_phone_number" | "multiple_phone_numbers" | "phone_not_in_waba" };

/**
 * Decide WABA + número. O session info do popup é só uma dica do navegador: o
 * WABA tem de estar nos target_ids do token (senão um cliente malicioso poderia
 * apontar para a WABA de outra empresa). Sem session info (popup fechado antes
 * do evento), cai no único WABA/número autorizado; ambiguidade → erro explícito.
 */
export function resolveSignupAssets(input: {
  sessionWabaId?: string | null;
  sessionPhoneNumberId?: string | null;
  grantedWabaIds: string[];
  /** Números do WABA escolhido (GET /{waba}/phone_numbers). Chamado após escolher o WABA. */
  wabaPhoneIds: (wabaId: string) => string[];
}): AssetResolution {
  const granted = input.grantedWabaIds;
  if (granted.length === 0) return { ok: false, error: "no_waba_granted" };

  let wabaId: string;
  const hinted = input.sessionWabaId?.trim();
  if (hinted) {
    // Token sem target_ids granulares não acontece no ES; se acontecer, recusamos.
    if (!granted.includes(hinted)) return { ok: false, error: "waba_not_granted" };
    wabaId = hinted;
  } else if (granted.length === 1) {
    wabaId = granted[0];
  } else {
    return { ok: false, error: "multiple_wabas" };
  }

  const phones = input.wabaPhoneIds(wabaId);
  const hintedPhone = input.sessionPhoneNumberId?.trim();
  if (hintedPhone) {
    if (!phones.includes(hintedPhone)) return { ok: false, error: "phone_not_in_waba" };
    return { ok: true, wabaId, phoneNumberId: hintedPhone };
  }
  if (phones.length === 1) return { ok: true, wabaId, phoneNumberId: phones[0] };
  return { ok: false, error: phones.length === 0 ? "no_phone_number" : "multiple_phone_numbers" };
}

/** "+55 11 99999-9999" → "+5511999999999"; null se não for um E.164 plausível. */
export function toE164(display: string | null | undefined): string | null {
  const digits = String(display ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export interface ExistingWabaRow {
  id: string;
  source: string | null;
}
export interface ExistingEndpointRow {
  id: string;
  organization_id: string;
  organization_integration_id: string | null;
  provider: string | null;
  sender_sid: string | null;
}

export type WritePlan =
  | { action: "insert" }
  | { action: "reauthorize"; organizationIntegrationId: string; endpointId: string | null }
  | {
    action: "conflict";
    error:
      | "waba_connected_manually"
      | "phone_in_other_org"
      | "phone_in_other_integration"
      | "address_in_use";
    existingEndpointId?: string;
    existingProvider?: string | null;
  };

/**
 * Plano de gravação idempotente:
 * - mesma WABA já conectada por Embedded Signup → re-autoriza (troca token, reaproveita linhas);
 * - mesma WABA conectada pelo modo manual (app próprio do cliente) → recusa: trocar o app
 *   dono do webhook em silêncio duplicaria/perderia eventos; o usuário desconecta antes;
 * - número já usado em outra org, ou por outra integração/provider nesta org → recusa
 *   (migração de provider continua no fluxo de migração dedicado).
 */
export function planEmbeddedWrite(input: {
  organizationId: string;
  existingWaba: ExistingWabaRow | null;
  endpointByPhoneId: ExistingEndpointRow | null;
  endpointByAddress: ExistingEndpointRow | null;
}): WritePlan {
  const { organizationId, existingWaba, endpointByPhoneId, endpointByAddress } = input;

  if (existingWaba && existingWaba.source !== EMBEDDED_SOURCE) {
    return { action: "conflict", error: "waba_connected_manually" };
  }

  if (endpointByPhoneId && endpointByPhoneId.organization_id !== organizationId) {
    return { action: "conflict", error: "phone_in_other_org" };
  }
  if (
    endpointByPhoneId &&
    (!existingWaba || endpointByPhoneId.organization_integration_id !== existingWaba.id)
  ) {
    return {
      action: "conflict",
      error: "phone_in_other_integration",
      existingEndpointId: endpointByPhoneId.id,
      existingProvider: endpointByPhoneId.provider,
    };
  }
  if (endpointByAddress && endpointByAddress.id !== endpointByPhoneId?.id) {
    return {
      action: "conflict",
      error: "address_in_use",
      existingEndpointId: endpointByAddress.id,
      existingProvider: endpointByAddress.provider,
    };
  }

  if (existingWaba) {
    return {
      action: "reauthorize",
      organizationIntegrationId: existingWaba.id,
      endpointId: endpointByPhoneId?.id ?? null,
    };
  }
  return { action: "insert" };
}

/** PIN de 6 dígitos para a verificação em duas etapas do número (registro Cloud API). */
export function generateTwoStepPin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export const EMBEDDED_ERROR_MESSAGES: Record<string, string> = {
  no_waba_granted: "A Meta não autorizou nenhuma conta do WhatsApp. Refaça a conexão e selecione a conta.",
  waba_not_granted: "A conta do WhatsApp escolhida não foi autorizada para a Seialz.",
  multiple_wabas: "Mais de uma conta do WhatsApp foi autorizada. Refaça a conexão escolhendo só uma.",
  no_phone_number: "A conta do WhatsApp não tem número. Adicione um número no fluxo da Meta.",
  multiple_phone_numbers: "A conta tem vários números. Refaça a conexão e selecione o número.",
  phone_not_in_waba: "O número escolhido não pertence à conta do WhatsApp autorizada.",
  waba_connected_manually:
    "Esta conta do WhatsApp já está conectada pelo modo manual. Desconecte-a antes de usar a conexão pela Meta.",
  phone_in_other_org: "Este número já está conectado em outra organização.",
  phone_in_other_integration: "Este número já está conectado nesta organização por outra integração.",
  address_in_use: "Já existe um número WhatsApp igual nesta organização (outro provedor). Use a migração de provedor.",
  another_waba_connected:
    "Esta organização já tem outra conta do WhatsApp conectada. Desconecte-a antes de conectar uma nova.",
};

/** Flag `meta_multi_waba` (mesma regra do hook useMetaMultiWabaFlag). */
export function multiWabaEnabledFor(
  flag: { is_enabled?: boolean | null; organization_ids?: string[] | null } | null,
  organizationId: string,
): boolean {
  if (!flag?.is_enabled) return false;
  const orgs = flag.organization_ids ?? [];
  return orgs.length === 0 || orgs.includes(organizationId);
}
