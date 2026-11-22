// Variáveis dos templates das réguas: cada variável do template ({{1}}, {{nome}}...) recebe um texto com
// marcadores, preenchido na hora do envio a partir do contato, da oportunidade, do responsável e da org.
// Vale para qualquer org (campos customizados pelo nome interno: {{custom.trilha}}).

export interface CadenceVariableContext {
  contact: { full_name?: string | null; first_name?: string | null; email?: string | null; phone?: string | null };
  opportunity: { title?: string | null; amount?: number | null; currency?: string | null };
  owner: { full_name?: string | null; first_name?: string | null } | null;
  org: { name?: string | null };
  /** Campos customizados (oportunidade por cima do contato), pelo nome interno. */
  custom: Record<string, unknown>;
}

/** Marcadores aceitos (para a tela do editor). */
export const CADENCE_VARIABLE_TOKENS = [
  { token: "{{contact.first_name}}", label: "Primeiro nome do contato" },
  { token: "{{contact.full_name}}", label: "Nome completo do contato" },
  { token: "{{contact.email}}", label: "E-mail do contato" },
  { token: "{{opportunity.title}}", label: "Título da oportunidade" },
  { token: "{{opportunity.amount}}", label: "Valor da oportunidade" },
  { token: "{{owner.first_name}}", label: "Primeiro nome do responsável" },
  { token: "{{owner.full_name}}", label: "Nome do responsável" },
  { token: "{{org.name}}", label: "Nome da organização" },
] as const;

const firstWord = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] || "";

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(formatValue).filter(Boolean).join(", ");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y}`;
  }
  return String(v).trim();
}

function resolveToken(path: string, ctx: CadenceVariableContext): string {
  const [scope, ...rest] = path.split(".");
  const key = rest.join(".");
  switch (scope) {
    case "contact":
      if (key === "first_name") return (ctx.contact.first_name ?? "").trim() || firstWord(ctx.contact.full_name);
      if (key === "full_name") return (ctx.contact.full_name ?? "").trim();
      if (key === "email") return (ctx.contact.email ?? "").trim();
      if (key === "phone") return (ctx.contact.phone ?? "").trim();
      return "";
    case "opportunity":
      if (key === "title") return (ctx.opportunity.title ?? "").trim();
      if (key === "amount") {
        const n = Number(ctx.opportunity.amount);
        if (!Number.isFinite(n) || n <= 0) return "";
        try {
          return new Intl.NumberFormat("pt-BR", { style: "currency", currency: ctx.opportunity.currency || "BRL" }).format(n);
        } catch { return n.toFixed(2); }
      }
      return "";
    case "owner":
      if (!ctx.owner) return "";
      if (key === "first_name") return (ctx.owner.first_name ?? "").trim() || firstWord(ctx.owner.full_name);
      if (key === "full_name") return (ctx.owner.full_name ?? "").trim();
      return "";
    case "org":
      return key === "name" ? (ctx.org.name ?? "").trim() : "";
    case "custom":
      return formatValue(ctx.custom[key]);
    default:
      return "";
  }
}

/**
 * Preenche as variáveis. Devolve os valores prontos ou a lista de variáveis que ficaram vazias
 * (a Meta recusa variável vazia; melhor pular o envio e registrar o motivo).
 */
export function resolveCadenceVariables(
  mapping: Record<string, unknown> | null | undefined,
  ctx: CadenceVariableContext,
): { ok: true; values: Record<string, string> } | { ok: false; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const [variable, raw] of Object.entries(mapping ?? {})) {
    const text = String(raw ?? "")
      .replace(/\{\{\s*([a-z_]+(?:\.[a-z0-9_]+)+)\s*\}\}/gi, (_m, path: string) => resolveToken(path.toLowerCase(), ctx))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) missing.push(variable);
    else values[variable] = text.slice(0, 1024);
  }
  return missing.length ? { ok: false, missing } : { ok: true, values };
}
