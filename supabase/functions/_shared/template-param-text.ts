// Sanitização de parâmetros de template WhatsApp (Meta Cloud API).
// Espelha src/lib/templateParamText.ts — ver racional lá (erro 132018).

export function sanitizeTemplateParam(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}
