/**
 * Cores do tema da organização.
 *
 * `organizations.theme_primary_color` guarda o triplet HSL usado pelas
 * variáveis CSS do shadcn (ex.: "154 22% 19%"). Estas funções convertem
 * entre esse formato e hex (#RRGGBB), para o campo de cor livre em
 * Configurações > Tema.
 */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const HSL_RE = /^\s*(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/;

/** Normaliza "#abc" / "abc" / "#AABBCC" para "#aabbcc". Retorna null se inválido. */
export function normalizeHex(input: string): string | null {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

/** "#263B32" → "154 22% 19%" (inteiros, como o resto dos presets). Null se inválido. */
export function hexToHslTriplet(input: string): string | null {
  const hex = normalizeHex(input);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return `${Math.round(h) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** "154 22% 19%" → "#263b32" (aproximado pelo arredondamento do triplet). Null se inválido. */
export function hslTripletToHex(triplet: string): string | null {
  const m = HSL_RE.exec(triplet);
  if (!m) return null;
  const h = Number(m[1]) % 360;
  const s = Math.min(100, Number(m[2])) / 100;
  const l = Math.min(100, Number(m[3])) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m0) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}
