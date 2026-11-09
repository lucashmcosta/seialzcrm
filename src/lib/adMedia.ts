// Ordem de tentativa da imagem do anúncio: a que veio com o lead (maior, mas o link da Meta
// expira em poucos dias) e depois a miniatura do Marketing, renovada a cada sincronização.
// Link de página (Reel, post) não é imagem e fica de fora.
export function adImageCandidates(mediaUrl: string | null | undefined, thumbnailUrl: string | null | undefined): string[] {
  const out: string[] = [];
  if (mediaUrl && !/^https?:\/\/(www\.)?(facebook|instagram)\.com\//i.test(mediaUrl)) out.push(mediaUrl);
  if (thumbnailUrl) out.push(thumbnailUrl);
  return out;
}
