import { PDFDocument } from 'pdf-lib';

export const MAX_PAGES = 20;

const isPdfFile = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
const isImageFile = (f: File) => f.type.startsWith('image/');

// Pode ser mesclado num PDF? (imagem ou PDF). Outros formatos sobem como estão.
export const isMergeable = (f: File) => isPdfFile(f) || isImageFile(f);
export const allMergeable = (files: File[]) => files.every(isMergeable);

// Corrige orientação (EXIF) desenhando num canvas com imageOrientation 'from-image'
// e reexporta como JPEG — sem depender de lib de EXIF.
async function normalizedJpegBytes(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível para processar a imagem');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao converter imagem'))), 'image/jpeg', 0.92),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

// Nº real de páginas de um arquivo: PDF → páginas do documento; imagem → 1;
// outros formatos → 1 (não temos como paginar). Base para saber se um doc de
// duas faces está completo (>= 2 páginas), em vez de contar arquivos.
export async function pageCountOf(file: File): Promise<number> {
  if (isPdfFile(file)) {
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer());
      return doc.getPageCount();
    } catch {
      return 1;
    }
  }
  return 1;
}

// Mescla imagens e/ou PDFs em um único PDF (teto de MAX_PAGES páginas).
export async function mergeFilesToPdf(files: File[], outName = 'documento.pdf'): Promise<File> {
  const out = await PDFDocument.create();
  let pages = 0;
  for (const f of files) {
    if (pages >= MAX_PAGES) break;
    if (isPdfFile(f)) {
      const src = await PDFDocument.load(await f.arrayBuffer());
      const idx = src.getPageIndices().slice(0, MAX_PAGES - pages);
      const copied = await out.copyPages(src, idx);
      for (const p of copied) { out.addPage(p); pages++; }
    } else if (isImageFile(f)) {
      const img = await out.embedJpg(await normalizedJpegBytes(f));
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      pages++;
    }
  }
  if (pages === 0) throw new Error('Nenhuma página válida para mesclar (use imagens ou PDFs).');
  const bytes = await out.save();
  const blob = new Blob([bytes as unknown as ArrayBufferView], { type: 'application/pdf' });
  return new File([blob], outName, { type: 'application/pdf' });
}
