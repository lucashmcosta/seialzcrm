// Variáveis de modelos em Word ({{nome_da_variavel}}) → valores do CRM, ligação automática pelo nome.
// Ordem: 1) campo personalizado com o mesmo nome (oportunidade, depois contato);
//        2) campo nativo do contato (aceita prefixo contratante_/cliente_/contato_);
//        3) campo personalizado com o nome sem o prefixo (ex.: contratante_estado_civil → estado_civil);
//        4) datas do documento (data_atual).
// Formatos: data dd/mm/aaaa; lista usa o "texto no contrato" da opção (ou o rótulo); sim/não.
// deno-lint-ignore no-explicit-any
type Any = any;

export interface CustomDef { id: string; name: string; field_type: string; options: unknown; module: "contacts" | "opportunities" }
export interface DocxVarContext {
  contact: Record<string, unknown>;
  birthDate: string | null;
  customDefs: CustomDef[];
  customValues: Map<string, unknown>; // field_definition_id → value (do contato e da oportunidade)
  now: Date;
}

const PREFIXES = ["contratante_", "cliente_", "contato_"];
const OPTIONAL_SUFFIXES = ["complemento"];

const s = (x: unknown) => (x == null ? "" : String(x)).trim();

export function formatDateBR(raw: unknown): string {
  const v = s(raw);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return v;
}
function formatCpf(raw: unknown): string {
  const d = s(raw).replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : s(raw);
}
function formatCep(raw: unknown): string {
  const d = s(raw).replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : s(raw);
}
function formatPhone(raw: unknown): string {
  let d = s(raw).replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s(raw);
}

function optionText(def: CustomDef, value: unknown): string {
  const list = Array.isArray(def.options) ? def.options : (def.options as Any)?.options;
  const v = s(value);
  if (Array.isArray(list)) {
    for (const o of list) {
      if (typeof o === "string") { if (o === v) return o; continue; }
      if (s(o?.value) === v || s(o?.label) === v) return s(o?.contract_text) || s(o?.label) || v;
    }
  }
  return v;
}

function customValue(def: CustomDef, raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (def.field_type === "date") return formatDateBR(raw);
  if (def.field_type === "select") return optionText(def, raw);
  if (def.field_type === "multiselect" && Array.isArray(raw)) return raw.map((x) => optionText(def, x)).join(", ");
  if (def.field_type === "boolean") return raw === true || raw === "true" ? "Sim" : "Não";
  return s(raw);
}

function nativeValue(base: string, ctx: DocxVarContext): string | undefined {
  const c = ctx.contact;
  const name = s(c.full_name) || [s(c.first_name), s(c.last_name)].filter(Boolean).join(" ");
  const map: Record<string, () => string> = {
    nome: () => name, nome_completo: () => name,
    cpf: () => formatCpf(c.cpf), rg: () => s(c.rg), rg_orgao: () => s(c.rg_issuer), orgao_emissor: () => s(c.rg_issuer),
    nacionalidade: () => s(c.nationality), data_nascimento: () => formatDateBR(ctx.birthDate),
    logradouro: () => s(c.address_street), endereco: () => s(c.address_street), rua: () => s(c.address_street),
    numero: () => s(c.address_number), complemento: () => s(c.address_complement), bairro: () => s(c.address_neighborhood),
    cidade: () => s(c.address_city), uf: () => s(c.address_state), estado: () => s(c.address_state), cep: () => formatCep(c.address_zip),
    celular: () => formatPhone(c.phone), telefone: () => formatPhone(c.phone), whatsapp: () => formatPhone(c.phone), email: () => s(c.email),
  };
  const fn = map[base];
  return fn ? fn() : undefined;
}

export function resolveDocxVariables(names: string[], ctx: DocxVarContext): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  const byName = (n: string) =>
    ctx.customDefs.find((d) => d.module === "opportunities" && d.name === n) ?? ctx.customDefs.find((d) => d.module === "contacts" && d.name === n);
  const today = ctx.now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  for (const n of names) {
    const key = n.trim();
    const lower = key.toLowerCase();
    const base = PREFIXES.reduce((acc, p) => (acc.startsWith(p) ? acc.slice(p.length) : acc), lower);
    let val: string | undefined;
    const exact = byName(key) ?? byName(lower);
    if (exact) val = customValue(exact, ctx.customValues.get(exact.id));
    if (!val) { const nv = nativeValue(base, ctx); if (nv !== undefined && (nv || !exact)) val = nv; }
    if (!val && base !== lower) { const d = byName(base); if (d) val = customValue(d, ctx.customValues.get(d.id)); }
    if (!val && (lower === "data_atual" || lower === "data_hoje" || lower === "data")) val = today;
    values[key] = val ?? "";
    if (!val && !OPTIONAL_SUFFIXES.some((x) => base.endsWith(x))) missing.push(key);
  }
  return { values, missing };
}

/** Rótulo legível de uma variável para mensagens ao vendedor. */
export function variableLabel(n: string): string {
  return n.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
