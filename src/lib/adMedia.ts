// Ordem de tentativa da imagem do anúncio: a miniatura grande do Marketing (renovada a cada
// sincronização), a que veio com o lead (o link da Meta expira em poucos dias) e, por último,
// a miniatura de 64px gravada antes da sincronização pedir o tamanho maior.
// Link de página (Reel, post) não é imagem e fica de fora.
export function adImageCandidates(mediaUrl: string | null | undefined, thumbnailUrl: string | null | undefined): string[] {
  const media = mediaUrl && !/^https?:\/\/(www\.)?(facebook|instagram)\.com\//i.test(mediaUrl) ? mediaUrl : null;
  const smallThumbnail = !!thumbnailUrl && /_p64x64_/.test(thumbnailUrl);
  return [smallThumbnail ? null : thumbnailUrl, media, smallThumbnail ? thumbnailUrl : null].filter((u): u is string => !!u);
}
