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

/** Altura aproximada usada apenas ANTES da primeira medição real do item. */
export const FALLBACK_ITEM_HEIGHT = 64;

/** Orçamento visual padrão quando a área de conversa ainda não foi medida. */
export const DEFAULT_BLOCK_BUDGET_PX = 480;

export interface BlockCollapseState {
  /** Quantas mensagens do bloco ficam visíveis. */
  visibleCount: number;
  /** Quantas mensagens ficam ocultas (0 = sem ação "Ver mais"). */
  hiddenCount: number;
  /** Se a ação de expandir/recolher deve ser exibida. */
  showToggle: boolean;
}

/**
 * Decide o colapso de um container de contexto por ESPAÇO VISUAL.
 *
 * `heights` traz a altura de cada mensagem do bloco, na ordem cronológica —
 * preferencialmente a altura real renderizada (medida no DOM). Quando a altura
 * de um item ainda não foi medida, o chamador passa um fallback aproximado.
 *
 * Percorre do fim para o começo somando alturas até estourar `budgetPx`,
 * garantindo pelo menos uma mensagem visível. O bloco atual (último da
 * timeline) nunca colapsa.
 */
export function resolveBlockCollapseByHeight(
  heights: number[],
  budgetPx: number,
  isCurrentBlock: boolean,
  expanded: boolean,
): BlockCollapseState {
  const total = heights.length;
  if (total === 0) return { visibleCount: 0, hiddenCount: 0, showToggle: false };
  if (isCurrentBlock) return { visibleCount: total, hiddenCount: 0, showToggle: false };

  const budget = budgetPx > 0 ? budgetPx : DEFAULT_BLOCK_BUDGET_PX;
  let used = 0;
  let visible = 0;
  for (let i = total - 1; i >= 0; i -= 1) {
    const h = heights[i] > 0 ? heights[i] : FALLBACK_ITEM_HEIGHT;
    if (visible > 0 && used + h > budget) break;
    used += h;
    visible += 1;
  }
  if (visible < 1) visible = 1;

  if (visible >= total) return { visibleCount: total, hiddenCount: 0, showToggle: false };
  if (expanded) return { visibleCount: total, hiddenCount: 0, showToggle: true };
  return { visibleCount: visible, hiddenCount: total - visible, showToggle: true };
}



export interface GroupingItem {
  /** Tipo do item da timeline: mensagem, nota interna, evento de sistema, evento de CRM. */
  kind: 'message' | 'note' | 'system' | 'event';
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
  /** Endpoint (número de envio/recebimento) da mensagem. */
  endpointId?: string | null;
  /** Provider do endpoint (meta_cloud_api | twilio | evolution_api). */
  provider?: string | null;
  /** Índice do bloco de contexto (preenchido por computeContextBlocks). */
  blockIndex?: number;
}

export interface ContextBlockFlags {
  isBlockStart: boolean;
  isBlockEnd: boolean;
  blockIndex: number;
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
  if ((prev.blockIndex ?? 0) !== (curr.blockIndex ?? 0)) return false;
  if (!sameSender(prev, curr)) return false;
  return curr.timestamp - prev.timestamp <= GROUP_GAP_MS;
}

/**
 * Blocos de CONTEXTO (estilo Kommo). Um bloco = um NÚMERO/endpoint usado na
 * conversa. A ÚNICA condição de corte é a troca real do número (`endpointBreak`).
 * Não quebram bloco: virada de dia, operador/IA, sender_user_id, direção,
 * nota interna, evento de sistema, activity, intervalo de tempo ou tipo de mídia.
 */
function continuesBlock(prev: GroupingItem | undefined, curr: GroupingItem): boolean {
  if (!prev) return false;
  return !curr.endpointBreak;
}

export function computeContextBlocks(items: GroupingItem[]): ContextBlockFlags[] {
  const starts: boolean[] = items.map((item, i) => !continuesBlock(items[i - 1], item));
  let blockIndex = -1;
  const indexes = starts.map((isStart) => {
    if (isStart) blockIndex += 1;
    return blockIndex;
  });
  return items.map((_item, i) => ({
    isBlockStart: starts[i],
    isBlockEnd: i === items.length - 1 || starts[i + 1] === true,
    blockIndex: indexes[i],
  }));
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
