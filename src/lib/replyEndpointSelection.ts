// ============================================================================
// Seleção do endpoint de resposta (Comercial) — contrato compartilhado UI/envio.
// Espelho de `supabase/functions/_shared/reply-endpoint-selection.ts`.
//
// A UI NUNCA mostra "Automático": ela sempre exibe um número real. O que a UI
// guarda é a ORIGEM da seleção:
//   • "derived" → seleção automática pelo endpoint da ÚLTIMA MENSAGEM VÁLIDA da
//     conversa. O backend RECONSULTA essa mensagem no momento do envio, então
//     uma UI defasada nunca "congela" o número errado.
//   • "manual"  → escolha explícita do operador. O backend usa exatamente esse
//     endpoint (fail-closed) e registra a autoria.
// ============================================================================

export type ReplySelectionSource = 'derived' | 'manual';

export interface ReplyEndpointSelection {
  source: ReplySelectionSource;
  /** obrigatório em "manual"; em "derived" é apenas hint visual */
  endpointId?: string | null;
}

export interface RoutingMessageRow {
  endpoint_id?: string | null;
  direction?: string | null;
  deleted_at?: string | null;
  is_internal_note?: boolean | null;
  sent_at?: string | null;
  created_at?: string | null;
}

/** Definição única de "mensagem válida para rotear resposta". */
export function isValidRoutingMessage(row: RoutingMessageRow): boolean {
  if (!row.endpoint_id) return false;
  if (row.direction !== 'inbound' && row.direction !== 'outbound') return false;
  if (row.deleted_at) return false;
  if (row.is_internal_note === true) return false;
  return true;
}

/** Última mensagem válida (sent_at DESC, created_at DESC). */
export function pickLastValidMessage(rows: RoutingMessageRow[]): RoutingMessageRow | null {
  const ts = (r: RoutingMessageRow) => new Date(r.sent_at ?? r.created_at ?? 0).getTime();
  const valid = rows.filter(isValidRoutingMessage);
  if (valid.length === 0) return null;
  return (
    [...valid].sort((a, b) => {
      const d = ts(b) - ts(a);
      if (d !== 0) return d;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    })[0] ?? null
  );
}

/**
 * Endpoint exibido no seletor:
 *   manual explícito → último válido da conversa → default legado da Route.
 */
export function deriveSelectedEndpoint(input: {
  manualEndpointId: string | null;
  lastMessageEndpointId: string | null;
  routeDefaultEndpointId: string | null;
}): { endpointId: string | null; source: ReplySelectionSource } {
  if (input.manualEndpointId) return { endpointId: input.manualEndpointId, source: 'manual' };
  return {
    endpointId: input.lastMessageEndpointId ?? input.routeDefaultEndpointId ?? null,
    source: 'derived',
  };
}

/** Payload de envio: manual comanda o endpoint; derived deixa o backend decidir. */
export function replySelectionPayload(
  enabled: boolean,
  selection: { endpointId: string | null; source: ReplySelectionSource },
): ReplyEndpointSelection | undefined {
  if (!enabled) return undefined;
  if (selection.source === 'manual' && selection.endpointId) {
    return { source: 'manual', endpointId: selection.endpointId };
  }
  return { source: 'derived', endpointId: selection.endpointId ?? null };
}
