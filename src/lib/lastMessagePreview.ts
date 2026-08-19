/**
 * Helper PURO para a linha de preview da última mensagem na lista de conversas.
 *
 * Nunca consulta rede, nunca depende de React. Recebe apenas os dados já
 * disponíveis (`message_threads.last_message_*` + resolução em lote de
 * `messages.media_type` / `messages.whatsapp_status`).
 */

export type PreviewKind = 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker';

/** Ícone de status outbound; `null` = não renderizar nada (inclui inbound). */
export type PreviewStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | null;

export interface LastMessagePreviewInput {
  content: string | null | undefined;
  direction: string | null | undefined;
  mediaType?: string | null;
  whatsappStatus?: string | null;
}

export interface LastMessagePreviewResult {
  kind: PreviewKind;
  /** Texto a exibir (uma linha). Para mídia é o rótulo ("Áudio", "Foto", ...). */
  text: string;
  status: PreviewStatus;
}

const MEDIA_LABELS: Record<Exclude<PreviewKind, 'text'>, string> = {
  audio: 'Áudio',
  image: 'Foto',
  video: 'Vídeo',
  document: 'Documento',
  sticker: 'Figurinha',
};

/** Normaliza `media_type` (pode vir como 'image' ou 'image/jpeg'). */
function kindFromMediaType(mediaType: string | null | undefined): PreviewKind | null {
  if (!mediaType) return null;
  const v = mediaType.toLowerCase();
  if (v.includes('sticker')) return 'sticker';
  if (v.startsWith('audio') || v === 'voice' || v === 'ptt') return 'audio';
  if (v.startsWith('image') || v === 'photo') return 'image';
  if (v.startsWith('video')) return 'video';
  if (v.startsWith('application') || v.includes('document') || v === 'file' || v === 'pdf') {
    return 'document';
  }
  return null;
}

/** Fallback legado: conteúdos gravados como "[Áudio]", "[Imagem]", etc. */
function kindFromLegacyMarker(content: string): PreviewKind | null {
  const m = content.trim().match(/^\[([^\]]+)\]$/);
  if (!m) return null;
  const v = m[1]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (v.includes('audio') || v.includes('voz')) return 'audio';
  if (v.includes('imagem') || v.includes('foto') || v.includes('image')) return 'image';
  if (v.includes('video')) return 'video';
  if (v.includes('documento') || v.includes('arquivo') || v.includes('document')) return 'document';
  if (v.includes('figurinha') || v.includes('sticker')) return 'sticker';
  return null;
}

function normalizeStatus(
  direction: string | null | undefined,
  whatsappStatus: string | null | undefined,
): PreviewStatus {
  // Inbound NUNCA exibe check. Status ausente/desconhecido = nenhum ícone.
  if (direction !== 'outbound') return null;
  if (!whatsappStatus) return null;
  const v = whatsappStatus.toLowerCase();
  if (v === 'sending' || v === 'queued' || v === 'accepted' || v === 'pending') return 'sending';
  if (v === 'sent') return 'sent';
  if (v === 'delivered') return 'delivered';
  if (v === 'read') return 'read';
  if (v === 'failed' || v === 'undelivered' || v === 'error') return 'failed';
  return null;
}

export function buildLastMessagePreview(
  input: LastMessagePreviewInput,
): LastMessagePreviewResult | null {
  const raw = (input.content ?? '').replace(/\s+/g, ' ').trim();
  const status = normalizeStatus(input.direction, input.whatsappStatus);

  const kind = kindFromMediaType(input.mediaType) ?? (raw ? kindFromLegacyMarker(raw) : null);
  if (kind) {
    return { kind, text: MEDIA_LABELS[kind as Exclude<PreviewKind, 'text'>], status };
  }

  if (!raw || raw === '...') return null;
  return { kind: 'text', text: raw, status };
}
