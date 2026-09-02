// Sanitização de parâmetros de template WhatsApp (Meta Cloud API).
//
// Causa raiz tratada (medida em produção, erro 132018 —
// "There's an issue with the parameters in your template"): a Cloud API rejeita
// valores de variável que contenham quebra de linha, tabulação ou sequências de
// espaços consecutivos (ex.: texto colado com "…link      |      Posso confirmar?").
//
// Regras: \r\n, \n, \t → espaço; runs de 2+ espaços → 1 espaço; trim nas pontas.
// NÃO altera o corpo aprovado do template nem mensagens de texto livre.

export function sanitizeTemplateParam(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function sanitizeTemplateVariables<T extends Record<string, unknown>>(
  vars: T | undefined | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars ?? {})) out[k] = sanitizeTemplateParam(v);
  return out;
}

// true quando a sanitização mudaria o valor (para avisar o operador na UI).
export function templateParamNeedsSanitize(value: unknown): boolean {
  const raw = String(value ?? "");
  return raw !== sanitizeTemplateParam(raw);
}
