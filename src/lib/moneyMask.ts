// Máscara de dinheiro para campos de valor (pt-BR: 1.900,50 · en-US: 1,900.50).
// Inteiros entram com separador de milhar enquanto a pessoa digita; centavos com o separador decimal.

export function moneySeparators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? '.',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? ',',
  };
}

export function currencySymbol(currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Aplica a máscara ao texto digitado (aceita só dígitos e um separador decimal, até 2 casas). */
export function maskMoneyInput(raw: string, locale: string): string {
  const { group, decimal } = moneySeparators(locale);
  // Aceita "." ou "," como decimal quando a pessoa digita; o último separador digitado vale como decimal
  // só se vier depois de dígitos e tiver no máximo 2 casas depois dele.
  const cleaned = raw.replace(/[^\d.,]/g, '');
  const lastSep = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  let intPart = cleaned;
  let decPart: string | null = null;
  if (lastSep >= 0) {
    const after = cleaned.slice(lastSep + 1).replace(/\D/g, '');
    const sepChar = cleaned[lastSep];
    // separador de milhar digitado pela própria pessoa (ex.: "1.000" em pt-BR) não vira decimal
    const looksLikeGroup = sepChar === group && after.length === 3;
    if (!looksLikeGroup && after.length <= 2) {
      intPart = cleaned.slice(0, lastSep);
      decPart = after;
    }
  }
  const intDigits = intPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!intDigits && decPart === null) return '';
  const grouped = (intDigits || '0').replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return decPart === null ? grouped : `${grouped}${decimal}${decPart.slice(0, 2)}`;
}

/** Converte o texto mascarado em número (null quando vazio). */
export function parseMoneyInput(masked: string, locale: string): number | null {
  if (!masked.trim()) return null;
  const { group, decimal } = moneySeparators(locale);
  const normalized = masked.split(group).join('').replace(decimal, '.').replace(/[^\d.]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Número → texto do campo (sem símbolo). Centavos só aparecem quando existem. */
export function formatMoneyInput(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}
