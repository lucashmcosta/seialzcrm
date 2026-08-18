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
  purpose?: string | null;
  assigned_user_id?: string | null;
}

export interface ManualReplyOptionShape {
  endpointId: string;
  address: string | null;
  displayName: string | null;
  provider: string | null;
  available: boolean;
  /** `vendor_personal` → número pessoal de um usuário */
  isPersonal: boolean;
  /** dono do número pessoal (`communication_endpoints.assigned_user_id`) */
  assignedUserId: string | null;
  ownerName: string | null;
  /** permissão do usuário atual sobre este endpoint (validada server-side) */
  allowedForUser: boolean;
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
  options?: { allowed?: boolean[]; ownerNames?: Record<string, string | null> },
): ManualReplyOptionShape[] {
  return candidates
    .map((ep, i) => ({ ep, i }))
    .filter(({ i }) => salesEligible[i] === true)
    .map(({ ep, i }) => {
      const assignedUserId = ep.assigned_user_id ?? null;
      return {
        endpointId: ep.id,
        address: ep.external_address,
        displayName: ep.display_name,
        provider: ep.provider,
        available: ep.is_active === true,
        isPersonal: String(ep.purpose ?? '').toLowerCase() === 'vendor_personal',
        assignedUserId,
        ownerName: assignedUserId ? (options?.ownerNames?.[assignedUserId] ?? null) : null,
        // Fail-closed: sem resposta explícita do servidor, o endpoint não é usável.
        allowedForUser: options?.allowed ? options.allowed[i] === true : true,
      };
    });
}

/**
 * Fase 2 — números pessoais: quando o endpoint selecionado (manual OU derivado
 * da última mensagem) não é permitido ao usuário, o composer é BLOQUEADO.
 * A thread, o histórico e o contexto do endpoint permanecem visíveis; a troca
 * de número é sempre explícita pelo usuário.
 */
export function composerBlockReason(
  selectedOption: ManualReplyOptionShape | null,
  options: ManualReplyOptionShape[],
): 'personal_other_user' | 'none_allowed' | null {
  const hasAllowed = options.some((o) => o.allowedForUser && o.available);
  if (!hasAllowed && options.length > 0) return 'none_allowed';
  if (selectedOption && !selectedOption.allowedForUser) return 'personal_other_user';
  return null;
}

/** Valor enviado no payload de envio: undefined = comportamento Automático. */
export function manualReplyPayloadValue(
  enabled: boolean,
  selectedEndpointId: string | null,
): string | undefined {
  return enabled && selectedEndpointId ? selectedEndpointId : undefined;
}
