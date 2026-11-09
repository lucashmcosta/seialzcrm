/** Regras dos materiais de apoio da Plamev (bucket plamev-materiais). Mesmos tipos da migration 20261109140000. */

export const BUCKET_MATERIAIS = 'plamev-materiais';

export const TIPOS_MATERIAL: Record<string, { tipo: 'image' | 'document'; ext: string; maxBytes: number }> = {
  'application/pdf': { tipo: 'document', ext: 'pdf', maxBytes: 16 * 1024 * 1024 },
  // O WhatsApp recusa imagem acima de 5 MB.
  'image/png': { tipo: 'image', ext: 'png', maxBytes: 5 * 1024 * 1024 },
  'image/jpeg': { tipo: 'image', ext: 'jpg', maxBytes: 5 * 1024 * 1024 },
  'image/webp': { tipo: 'image', ext: 'webp', maxBytes: 5 * 1024 * 1024 },
};

export const ACEITA_MATERIAL = Object.keys(TIPOS_MATERIAL).join(',');

/** Arquivo aceito? Devolve o motivo da recusa, ou null. */
export function recusaMaterial(file: { type: string; size: number }): string | null {
  const t = TIPOS_MATERIAL[file.type];
  if (!t) return 'Use PDF, PNG, JPG ou WEBP.';
  if (file.size > t.maxBytes) return `Arquivo grande demais: até ${t.maxBytes / 1024 / 1024} MB para ${t.tipo === 'image' ? 'imagem' : 'PDF'}.`;
  return null;
}

/**
 * Nome do arquivo que o cliente vê no WhatsApp (os providers usam o fim da URL): título sem acento, palavras com hífen.
 * "Coberturas ADVANCE (2026)" → "Coberturas-ADVANCE-2026.pdf".
 */
export function nomeArquivoMaterial(titulo: string, ext: string): string {
  const base = titulo.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return `${base || 'material'}.${ext}`;
}

export const tamanhoLegivel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
