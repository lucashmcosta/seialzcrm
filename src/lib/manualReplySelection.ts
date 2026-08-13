// ============================================================================
// Switch "Responder por" — helpers PUROS (sem supabase, sem React).
// Isolados para permitir validação determinística em stub/teste controlado.
// ============================================================================

export interface ManualReplyEndpointRow {
  id: string;
  external_address: string | null;
  display_name: string | null;
  provider: string | null;
  is_active: boolean | null;
  channel: string | null;
}

export interface ManualReplyOptionShape {
  endpointId: string;
  address: string | null;
  displayName: string | null;
  provider: string | null;
  available: boolean;
}

/** Somente canal whatsapp — a autorização por usuário já veio da query com RLS. */
export function filterWhatsAppCandidates(rows: Array<ManualReplyEndpointRow | null>) {
  return rows.filter(
    (ep): ep is ManualReplyEndpointRow => !!ep && ep.channel === 'whatsapp',
  );
}

/** Mantém apenas endpoints marcados como elegíveis ao Comercial pelo servidor. */
export function toManualReplyOptions(
  candidates: ManualReplyEndpointRow[],
  salesEligible: boolean[],
): ManualReplyOptionShape[] {
  return candidates
    .filter((_, i) => salesEligible[i] === true)
    .map((ep) => ({
      endpointId: ep.id,
      address: ep.external_address,
      displayName: ep.display_name,
      provider: ep.provider,
      available: ep.is_active === true,
    }));
}

/** Valor enviado no payload de envio: undefined = comportamento Automático. */
export function manualReplyPayloadValue(
  enabled: boolean,
  selectedEndpointId: string | null,
): string | undefined {
  return enabled && selectedEndpointId ? selectedEndpointId : undefined;
}
