// ============================================================================
// Seleção do endpoint de resposta (Comercial / WhatsApp) — contrato único.
//
// A UI nunca mostra "Automático": ela sempre exibe um número real. O estado
// interno guarda a ORIGEM da seleção:
//
//   • source = "manual"  → o operador escolheu explicitamente um número.
//                          O servidor usa EXATAMENTE esse endpoint (fail-closed).
//   • source = "derived" → seleção automática. O servidor RECONSULTA a última
//                          mensagem válida da thread no momento do envio
//                          (fonte de verdade) e usa o endpoint dela.
//
// "Última mensagem válida" (definição única, usada no cliente e no servidor):
//   direction ∈ ('inbound','outbound')  AND deleted_at IS NULL
//   AND is_internal_note IS NOT TRUE    AND endpoint_id IS NOT NULL
//   ordenada por sent_at DESC, created_at DESC (limit 1)
//
// Sem nenhuma mensagem válida ⇒ fallback legado `messaging_lines.active_endpoint_id`
// (auditado como "route_default"). Nunca há troca silenciosa quando existe
// contexto de conversa.
// ============================================================================

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

export type ReplySelectionSource = "derived" | "manual";
export type ReplyEndpointChoice = "derived" | "manual" | "route_default";

export interface ReplyEndpointSelection {
  source: ReplySelectionSource;
  /** obrigatório em "manual"; em "derived" é apenas hint visual da UI */
  endpointId?: string | null;
}

/** Normaliza o payload aceitando o contrato legado `manualReplyEndpointId`. */
export function normalizeReplySelection(input: {
  replyEndpointSelection?: ReplyEndpointSelection | null;
  manualReplyEndpointId?: string | null;
}): ReplyEndpointSelection {
  const sel = input.replyEndpointSelection ?? null;
  if (sel && sel.source === "manual" && sel.endpointId) {
    return { source: "manual", endpointId: sel.endpointId };
  }
  if (sel && sel.source === "derived") {
    return { source: "derived", endpointId: sel.endpointId ?? null };
  }
  // Compatibilidade: campo legado equivale a escolha manual explícita.
  if (input.manualReplyEndpointId) {
    return { source: "manual", endpointId: input.manualReplyEndpointId };
  }
  return { source: "derived", endpointId: null };
}

export interface LastValidMessageRow {
  endpoint_id?: string | null;
  direction?: string | null;
  deleted_at?: string | null;
  is_internal_note?: boolean | null;
  sent_at?: string | null;
  created_at?: string | null;
}

/** Filtro puro — espelho exato da query (usado em testes e no cliente). */
export function isValidRoutingMessage(row: LastValidMessageRow): boolean {
  if (!row.endpoint_id) return false;
  if (row.direction !== "inbound" && row.direction !== "outbound") return false;
  if (row.deleted_at) return false;
  if (row.is_internal_note === true) return false;
  return true;
}

/** Ordenação pura — sent_at DESC, created_at DESC. */
export function pickLastValidMessage(
  rows: LastValidMessageRow[],
): LastValidMessageRow | null {
  const valid = rows.filter(isValidRoutingMessage);
  if (valid.length === 0) return null;
  const ts = (r: LastValidMessageRow) =>
    new Date(r.sent_at ?? r.created_at ?? 0).getTime();
  return [...valid].sort((a, b) => {
    const d = ts(b) - ts(a);
    if (d !== 0) return d;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  })[0] ?? null;
}

/**
 * Última mensagem válida da thread — fonte de verdade da seleção "derived".
 * Retorna `null` quando a thread não tem nenhuma mensagem roteável.
 */
export async function fetchLastValidMessageEndpointId(
  db: Db,
  threadId: string,
): Promise<{ endpointId: string | null; error: string | null }> {
  const { data, error } = await db
    .from("messages")
    .select("endpoint_id, direction, sent_at, created_at")
    .eq("thread_id", threadId)
    .in("direction", ["inbound", "outbound"])
    .is("deleted_at", null)
    .not("is_internal_note", "is", true)
    .not("endpoint_id", "is", null)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { endpointId: null, error: error.message ?? "last_message_lookup_error" };
  const row = (data ?? null) as LastValidMessageRow | null;
  return { endpointId: row?.endpoint_id ?? null, error: null };
}
