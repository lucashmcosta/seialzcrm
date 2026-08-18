// ============================================================================
// Preview da última mensagem da conversa (lista lateral, conceito WhatsApp).
//
// Puramente apresentacional: não decide envio, rota, endpoint nem thread.
// A fonte é sempre a última mensagem VÁLIDA da thread (`last_message_id`),
// que o trigger `fn_update_thread_last_message` já mantém ignorando notas
// internas e mensagens deletadas.
// ============================================================================

export interface LastMessagePreviewInput {
  content?: string | null;
  mediaType?: string | null;
  direction?: string | null;
  /** `messages.sender_user_id` — usado só para o prefixo "Você:". */
  senderUserId?: string | null;
  /** `users.id` do usuário atual (interno). */
  currentUserId?: string | null;
}

const MEDIA_LABELS: Record<string, string> = {
  audio: '🎤 Áudio',
  voice: '🎤 Áudio',
  image: '📷 Foto',
  photo: '📷 Foto',
  video: '🎥 Vídeo',
  document: '📄 Documento',
  sticker: 'Sticker',
};

/** Colapsa quebras de linha e espaços em uma única linha. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Retorna o texto do preview, ou `null` quando não há mensagem válida
 * (thread sem mensagem) — nesse caso a linha não deve ser renderizada.
 */
export function formatLastMessagePreview(input: LastMessagePreviewInput): string | null {
  const mediaType = (input.mediaType || '').toLowerCase();
  const rawContent = singleLine(input.content || '');

  let body: string | null = null;
  if (mediaType) {
    body = MEDIA_LABELS[mediaType] ?? 'Mensagem';
  } else if (rawContent && rawContent !== '...') {
    // Mensagens de mídia antigas podem trazer apenas o marcador no conteúdo.
    const marker = rawContent.match(/^\[(Áudio|Imagem|Vídeo|Documento|Sticker)\]$/i);
    if (marker) {
      const key = marker[1].toLowerCase();
      body =
        key === 'áudio' ? MEDIA_LABELS.audio
        : key === 'imagem' ? MEDIA_LABELS.image
        : key === 'vídeo' ? MEDIA_LABELS.video
        : key === 'documento' ? MEDIA_LABELS.document
        : MEDIA_LABELS.sticker;
    } else {
      body = rawContent;
    }
  }

  if (!body) return null;

  const isOutbound = input.direction === 'outbound';
  const isMine =
    isOutbound &&
    !!input.currentUserId &&
    !!input.senderUserId &&
    input.senderUserId === input.currentUserId;

  return isMine ? `Você: ${body}` : body;
}
