import { getProxiedMediaUrlAsync } from '@/lib/mediaProxy';

// Transforma uma mídia recebida na conversa (URL do Storage `whatsapp-media` ou, no caso
// raro do Twilio, uma URL externa autenticada) em um File — pronto p/ o upload do módulo
// de Documentos. URLs do Twilio passam pelo proxy (twilio-media-proxy) p/ obter os bytes.

const EXT_BY_TYPE: Record<string, string> = { image: 'jpg', document: 'pdf', video: 'mp4', audio: 'ogg' };

// Nome do arquivo: usa o nome real da URL quando houver; senão deriva do tipo/rótulo.
function deriveName(rawUrl: string, mediaType?: string | null, label?: string | null): string {
  try {
    const u = new URL(rawUrl);
    const base = decodeURIComponent(u.pathname.split('/').pop() || '');
    if (base && base.includes('.')) return base;
  } catch { /* ignore */ }
  const ext = EXT_BY_TYPE[mediaType ?? ''] ?? 'bin';
  const stem = (label || 'documento').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'documento';
  return `${stem}.${ext}`;
}

export async function mediaUrlToFile(
  rawUrl: string,
  opts: { mediaType?: string | null; organizationId?: string; fileName?: string | null; label?: string | null } = {},
): Promise<File> {
  const url = await getProxiedMediaUrlAsync(rawUrl, opts.organizationId);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Não foi possível baixar a mídia da conversa.');
  const blob = await res.blob();
  const name = opts.fileName?.trim() || deriveName(rawUrl, opts.mediaType, opts.label);
  return new File([blob], name, { type: blob.type || undefined });
}

// A ação "Vincular como documento" só faz sentido p/ mídia que é documento.
export const ATTACHABLE_MEDIA_TYPES = new Set(['image', 'document']);
export const isAttachableMedia = (mediaType?: string | null): boolean =>
  !!mediaType && ATTACHABLE_MEDIA_TYPES.has(mediaType);
