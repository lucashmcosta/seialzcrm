/**
 * Agrupamento visual de mensagens (estilo Kommo).
 *
 * Função PURA, sem dependência de React e sem qualquer acesso a dados.
 * Recebe a lista já ordenada cronologicamente e devolve, por item,
 * se ele inicia e/ou encerra um bloco visual.
 *
 * Nada aqui altera histórico, ordenação, paginação ou modelo de mensagens.
 */

/** Intervalo máximo entre duas mensagens do mesmo remetente para manter o bloco. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

export interface GroupingItem {
  /** Tipo do item da timeline: mensagem, nota interna, evento de sistema. */
  kind: 'message' | 'note' | 'system';
  /** 'inbound' | 'outbound' | 'internal' | null */
  direction: string | null;
  /** sender_type estável ('user' | 'agent' | 'system' | null). */
  senderType: string | null;
  /** Identificador estável do autor (sender_user_id ou sender_agent_id). */
  senderId: string | null;
  /** Timestamp do item (ms). */
  timestamp: number;
  /** Mensagem com falha de envio encerra o bloco. */
  failed?: boolean;
  /** Mensagem que responde outra inicia novo bloco. */
  isReply?: boolean;
  /** Item precedido por separador de data. */
  dateBreak?: boolean;
  /** Item precedido pelo divisor "Número alterado". */
  endpointBreak?: boolean;
}

export interface GroupingFlags {
  isGroupStart: boolean;
  isGroupEnd: boolean;
}

function sameSender(a: GroupingItem, b: GroupingItem): boolean {
  if (a.kind !== b.kind) return false;
  if (a.direction !== b.direction) return false;
  // Inbound: mesma thread => mesmo contato, basta a direção.
  if (a.direction === 'inbound') return true;
  if ((a.senderType ?? null) !== (b.senderType ?? null)) return false;
  return (a.senderId ?? null) === (b.senderId ?? null);
}

/** Um item pode continuar o bloco anterior? */
function continuesGroup(prev: GroupingItem | undefined, curr: GroupingItem): boolean {
  if (!prev) return false;
  if (curr.kind !== 'message' || prev.kind !== 'message') return false;
  if (curr.dateBreak || curr.endpointBreak) return false;
  if (curr.isReply) return false;
  if (prev.failed) return false;
  if (!sameSender(prev, curr)) return false;
  return curr.timestamp - prev.timestamp <= GROUP_GAP_MS;
}

/**
 * Retorna as flags de agrupamento para cada item, na mesma ordem da entrada.
 * Cada flag depende apenas da vizinhança imediata (anterior/próximo).
 */
export function computeMessageGroups(items: GroupingItem[]): GroupingFlags[] {
  const starts: boolean[] = items.map((item, i) => !continuesGroup(items[i - 1], item));
  return items.map((item, i) => ({
    isGroupStart: starts[i],
    isGroupEnd:
      item.kind !== 'message' ||
      item.failed === true ||
      i === items.length - 1 ||
      starts[i + 1] === true,
  }));
}
