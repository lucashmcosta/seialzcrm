// Eventos do Nammux aplicados por uma RPC transacional (recibo + estado na mesma
// transação). Tipo novo entra aqui: uma linha no mapa e uma RPC `nammux_apply_*`
// com a assinatura (_organization_id, _event_id, _data, _occurred_at) → {status}.
// Os quatro tipos antigos continuam tratados em index.ts.

export const NAMMUX_EVENT_RPC: Readonly<Record<string, string>> = {
  "process.agenda.changed": "nammux_apply_process_event",
  "process.finance.changed": "nammux_apply_process_finance",
  "process.movement.added": "nammux_apply_process_movement",
};

export const LEGACY_EVENT_TYPES: readonly string[] = [
  "process.snapshot.updated",
  "process.sync.failed",
  "contact.address.updated",
  "classification.certified",
];

export function rpcForEvent(eventType: string): string | null {
  return Object.hasOwn(NAMMUX_EVENT_RPC, eventType) ? NAMMUX_EVENT_RPC[eventType] : null;
}

export function isSupportedEvent(eventType: string): boolean {
  return LEGACY_EVENT_TYPES.includes(eventType) || rpcForEvent(eventType) !== null;
}

/**
 * Resposta HTTP para o resultado da RPC. O worker do Nammux trata 2xx e 409
 * como "não reenviar" e qualquer outro status como "tentar de novo":
 *   - aplicado, duplicado ou versão antiga → 200
 *   - recusa definitiva (payload fora do contrato, negócio inexistente) → 409
 *   - resultado que não reconhecemos → 500, para o Nammux reenviar
 */
export function responseForApply(result: unknown): { status: number; body: Record<string, unknown> } {
  const r = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  switch (r.status) {
    case "applied":
      return { status: 200, body: { ok: true } };
    case "duplicate":
      return { status: 200, body: { ok: true, duplicate: true } };
    case "stale":
      return { status: 200, body: { ok: true, ignored_as_stale: true } };
    case "opportunity_not_found":
      return { status: 409, body: { error: "opportunity_not_found" } };
    case "invalid":
      return { status: 409, body: { error: typeof r.error === "string" ? r.error : "invalid_payload" } };
    default:
      return { status: 500, body: { error: "apply_failed" } };
  }
}
