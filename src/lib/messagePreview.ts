// ============================================================================
// Preview da última mensagem da conversa (lista lateral, conceito WhatsApp).
//
// Puramente apresentacional: não decide envio, rota, endpoint nem thread.
// A fonte é sempre a última mensagem VÁLIDA da thread (`last_message_id`),
// que o trigger `fn_update_thread_last_message` já mantém ignorando notas
// internas e mensagens deletadas.
// ============================================================================

export type LastMessagePreviewKind =
  | 'text'
  | 'audio'
  | 'image'
  | 'video'
  | 'document'
  | 'sticker';

export interface LastMessagePreviewInput {
  content?: string | null;
  mediaType?: string | null;
}

export interface LastMessagePreview {
  kind: LastMessagePreviewKind;
  /** Texto exibido: conteúdo da mensagem (texto) ou rótulo da mídia. */
  text: string;
}

const MEDIA_KIND: Record<string, LastMessagePreviewKind> = {
  audio: 'audio',
  voice: 'audio',
  ptt: 'audio',
  image: 'image',
  photo: 'image',
  video: 'video',
  document: 'document',
  sticker: 'sticker',
};

export const MEDIA_LABEL: Record<Exclude<LastMessagePreviewKind, 'text'>, string> = {
  audio: 'Áudio',
  image: 'Foto',
  video: 'Vídeo',
  document: 'Documento',
  sticker: 'Figurinha',
};

/** Marcadores legados gravados no `content` quando não há `media_type`. */
const LEGACY_MARKERS: Record<string, Exclude<LastMessagePreviewKind, 'text'>> = {
  'áudio': 'audio',
  'audio': 'audio',
  'imagem': 'image',
  'foto': 'image',
  'vídeo': 'video',
  'video': 'video',
  'documento': 'document',
  'sticker': 'sticker',
  'figurinha': 'sticker',
};

/** Colapsa quebras de linha e espaços em uma única linha. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Retorna o preview estruturado, ou `null` quando não há mensagem válida
 * (thread sem mensagem) — nesse caso a linha não deve ser renderizada.
 */
export function formatLastMessagePreview(
  input: LastMessagePreviewInput,
): LastMessagePreview | null {
  const mediaType = (input.mediaType || '').toLowerCase();
  const rawContent = singleLine(input.content || '');

  if (mediaType) {
    const kind = MEDIA_KIND[mediaType];
    if (kind && kind !== 'text') return { kind, text: MEDIA_LABEL[kind] };
    return { kind: 'text', text: rawContent || 'Mensagem' };
  }

  if (!rawContent || rawContent === '...') return null;

  const marker = rawContent.match(/^\[([^\]]+)\]$/);
  if (marker) {
    const kind = LEGACY_MARKERS[marker[1].toLowerCase()];
    if (kind) return { kind, text: MEDIA_LABEL[kind] };
  }

  return { kind: 'text', text: rawContent };
}
