/** AUTHENTICATION → 'authentication'; demais categorias mantêm 'text' (comportamento anterior). */
export function resolveSyncedTemplateType(category: string | null | undefined): string {
  return String(category ?? "").trim().toUpperCase() === "AUTHENTICATION" ? "authentication" : "text";
}
