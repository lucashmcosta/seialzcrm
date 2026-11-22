// Campos customizados recebidos de fora (webhook de leads): confere cada valor contra a definição
// do campo na org e devolve o que pode ser gravado e o que foi recusado (com o motivo).
// Valor inválido nunca derruba o lead: só aquele campo fica de fora.

export interface CustomFieldDefinition {
  id: string;
  name: string;
  label?: string | null;
  field_type: string; // text | select | multiselect | date | number
  options?: { options?: Array<{ label?: string; value?: string }> } | null;
}

export interface CustomFieldRejection { field: string; reason: string }

export interface CustomFieldParseResult {
  values: Array<{ definition: CustomFieldDefinition; value: unknown }>;
  rejected: CustomFieldRejection[];
}

const MAX_TEXT = 2000;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function optionFor(def: CustomFieldDefinition, raw: string): string | null {
  const wanted = fold(raw);
  for (const o of def.options?.options ?? []) {
    const value = o.value ?? o.label;
    if (!value) continue;
    if (fold(value) === wanted || (o.label && fold(o.label) === wanted)) return value;
  }
  return null;
}

/** Data em AAAA-MM-DD ou DD/MM/AAAA → AAAA-MM-DD (só datas que existem). */
export function parseDateInput(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function scalar(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return null;
}

/** Converte um valor para o formato do campo, ou devolve o motivo da recusa. */
export function coerceCustomFieldValue(def: CustomFieldDefinition, raw: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (def.field_type) {
    case "select": {
      const s = scalar(raw);
      if (!s) return { ok: false, reason: "valor vazio" };
      const opt = optionFor(def, s);
      return opt ? { ok: true, value: opt } : { ok: false, reason: `"${s.slice(0, 60)}" não é uma das opções do campo` };
    }
    case "multiselect": {
      const items = Array.isArray(raw) ? raw.map(scalar) : (scalar(raw) ?? "").split(/[,;]/).map((x) => x.trim());
      const clean = items.filter((x): x is string => !!x);
      if (!clean.length) return { ok: false, reason: "valor vazio" };
      const out: string[] = [];
      for (const item of clean) {
        const opt = optionFor(def, item);
        if (!opt) return { ok: false, reason: `"${item.slice(0, 60)}" não é uma das opções do campo` };
        if (!out.includes(opt)) out.push(opt);
      }
      return { ok: true, value: out };
    }
    case "date": {
      const s = scalar(raw);
      const d = s ? parseDateInput(s) : null;
      return d ? { ok: true, value: d } : { ok: false, reason: "data inválida (use AAAA-MM-DD ou DD/MM/AAAA)" };
    }
    case "number": {
      const s = scalar(raw);
      const n = s == null ? NaN : Number(s.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: "não é um número" };
    }
    default: {
      // text e tipos sem regra própria: texto limpo.
      const s = scalar(raw);
      return s ? { ok: true, value: s.slice(0, MAX_TEXT) } : { ok: false, reason: "valor vazio" };
    }
  }
}

/**
 * input = { nome_interno: valor } vindo do webhook. Campo que não existe na org é recusado.
 * null/"" é ignorado (não apaga nada).
 */
export function parseCustomFieldInput(input: unknown, defs: CustomFieldDefinition[]): CustomFieldParseResult {
  const result: CustomFieldParseResult = { values: [], rejected: [] };
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  const byName = new Map(defs.map((d) => [d.name.toLowerCase(), d]));
  for (const [name, raw] of Object.entries(input as Record<string, unknown>).slice(0, 100)) {
    if (raw == null || raw === "") continue;
    const def = byName.get(name.trim().toLowerCase());
    if (!def) { result.rejected.push({ field: name.slice(0, 80), reason: "campo não existe nesta organização" }); continue; }
    const c = coerceCustomFieldValue(def, raw);
    if (c.ok) result.values.push({ definition: def, value: c.value });
    else result.rejected.push({ field: def.name, reason: c.reason });
  }
  return result;
}

/**
 * Aceite de marketing vindo de fora. Aceita true/false, "sim"/"não", "yes"/"no", 1/0,
 * ou por canal: { whatsapp: true, email: false }. Devolve null quando não veio nada reconhecível.
 */
export function parseMarketingConsent(raw: unknown): Array<{ channel: "whatsapp" | "email" | "sms" | "all"; granted: boolean }> | null {
  const asBool = (v: unknown): boolean | null => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
    if (typeof v !== "string") return null;
    const s = fold(v);
    if (["sim", "s", "yes", "y", "true", "1", "aceito", "granted"].includes(s)) return true;
    if (["nao", "n", "no", "false", "0", "recuso", "revoked"].includes(s)) return false;
    return null;
  };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: Array<{ channel: "whatsapp" | "email" | "sms"; granted: boolean }> = [];
    for (const ch of ["whatsapp", "email", "sms"] as const) {
      const b = asBool((raw as Record<string, unknown>)[ch]);
      if (b !== null) out.push({ channel: ch, granted: b });
    }
    return out.length ? out : null;
  }
  const b = asBool(raw);
  return b === null ? null : [{ channel: "all", granted: b }];
}
