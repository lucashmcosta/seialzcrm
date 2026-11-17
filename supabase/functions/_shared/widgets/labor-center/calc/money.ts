/**
 * Lê número digitado em pt-BR ou com ponto decimal.
 * "3.000,50" → 3000.5 · "3000.50" → 3000.5 · "1.5" → 1.5 · "3.000" → 3000 · "" → NaN
 */
export function parseNum(raw: string): number {
  const s = raw.trim().replace(/\s|R\$|%/g, '');
  if (!s) return NaN;
  let n: string;
  if (s.includes(',')) n = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = s.replace(/\./g, '');
  else n = s;
  return /^\d*\.?\d+$/.test(n) ? Number(n) : NaN;
}

/** Igual a parseNum, mas campo vazio/ inválido vira `fallback`. */
export const numOr = (raw: string, fallback: number) => {
  const n = parseNum(raw);
  return Number.isFinite(n) ? n : fallback;
};

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtNum = (v: number, digits = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
