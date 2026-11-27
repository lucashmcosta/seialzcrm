// Agrupamento visual de imagens seguidas (álbum estilo WhatsApp).
// Puramente apresentação: não altera dados nem envio.

export const MEDIA_PLACEHOLDER_CONTENTS = [
  '📎 Mídia', '📷 Imagem', '🎵 Áudio', '🎬 Vídeo', '📎 Media', '📷 Image', '🎵 Audio', '🎬 Video',
  '[Áudio]', '[Imagem]', '[Vídeo]', '[Documento]', '[Sticker]',
];

export const ALBUM_MIN_IMAGES = 4;
export const ALBUM_MAX_GAP_MS = 5 * 60 * 1000;

export interface AlbumCandidate {
  /** false para notas, eventos e qualquer item que não seja mensagem. */
  isMessage: boolean;
  direction: string | null | undefined;
  senderId: string | null | undefined;
  mediaType: string | null | undefined;
  mediaUrls: string[] | null | undefined;
  content: string | null | undefined;
  sentAt: string | number;
  failed?: boolean;
}

export function isAlbumImage(c: AlbumCandidate): boolean {
  if (!c.isMessage || c.failed) return false;
  if (!c.mediaUrls || c.mediaUrls.length !== 1) return false;
  const isImage = c.mediaType === 'image' || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(c.mediaUrls[0]);
  if (!isImage) return false;
  const text = (c.content ?? '').trim();
  return text === '' || MEDIA_PLACEHOLDER_CONTENTS.includes(text);
}

const dayKey = (t: number) => new Date(t).toDateString();

/**
 * Retorna Map<índice do primeiro item, índices de todo o álbum>.
 * Só forma álbum com ALBUM_MIN_IMAGES ou mais imagens consecutivas.
 */
export function groupConsecutiveImages(items: AlbumCandidate[]): Map<number, number[]> {
  const albums = new Map<number, number[]>();
  let run: number[] = [];
  const flush = () => {
    if (run.length >= ALBUM_MIN_IMAGES) albums.set(run[0], run);
    run = [];
  };
  items.forEach((c, i) => {
    if (!isAlbumImage(c)) { flush(); return; }
    if (run.length > 0) {
      const prev = items[run[run.length - 1]];
      const t = new Date(c.sentAt).getTime();
      const pt = new Date(prev.sentAt).getTime();
      const same =
        prev.direction === c.direction &&
        (prev.senderId ?? null) === (c.senderId ?? null) &&
        dayKey(t) === dayKey(pt) &&
        t - pt <= ALBUM_MAX_GAP_MS;
      if (!same) flush();
    }
    run.push(i);
  });
  flush();
  return albums;
}

/** Índices que pertencem a um álbum mas não são o primeiro (não renderizam sozinhos). */
export function albumFollowerIndexes(albums: Map<number, number[]>): Set<number> {
  const s = new Set<number>();
  albums.forEach((idx) => idx.slice(1).forEach((i) => s.add(i)));
  return s;
}
