// SuvSign Signing Engine V2 — helpers compartilhados (Seialz Web).
// Contrato: SuvSign docs/reference/api/signing-engine-v2.md.
// O Seialz NÃO converte coordenadas e NÃO detecta table/image: consome o contrato.
import { decryptSecret } from "./crypto.ts";

export const SIGNING_V2_FLAG = "signing.suvsign_v2";
export const DEFAULT_V2_BASE = "https://vpysvlbfsvomwrgbpybc.supabase.co/functions/v1";

// deno-lint-ignore no-explicit-any
type Any = any;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export interface V2Creds { apiKey: string; webhookSecret: string | null; baseUrl: string }

export async function loadV2Credentials(admin: Any, orgId: string): Promise<V2Creds | null> {
  const { data } = await admin.from("suvsign_v2_credentials")
    .select("api_key_ciphertext, webhook_secret_ciphertext, base_url")
    .eq("organization_id", orgId).maybeSingle();
  if (!data?.api_key_ciphertext) return null;
  return {
    apiKey: await decryptSecret(data.api_key_ciphertext),
    webhookSecret: data.webhook_secret_ciphertext ? await decryptSecret(data.webhook_secret_ciphertext) : null,
    baseUrl: (data.base_url || DEFAULT_V2_BASE).replace(/\/+$/, ""),
  };
}

export async function suvsignFetch(creds: V2Creds, fn: "api-handler" | "api-v2", path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const headers: Record<string, string> = { "x-api-key": creds.apiKey, "Content-Type": "application/json", "x-signing-source": "seialz" };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${creds.baseUrl}/${fn}${path}`, { ...init, headers });
  const text = await res.text();
  let body: Any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, ok: res.ok, body };
}

// Mapeamento de status do provedor → status local (6 estados).
export function mapOperationStatus(s: unknown): string | null {
  const v = String(s ?? "");
  return ["draft", "sent", "in_progress", "completing", "completed", "cancelled"].includes(v) ? v : null;
}

// ---------- Autopreenchimento (paridade V1: SendToSignatureButton + CreateFromTemplate) ----------
export interface CrmPerson {
  first_name: string; last_name: string; name: string; email: string; phone: string;
  company?: string; street?: string; city?: string; state?: string; zip?: string; country?: string; job_title?: string;
}

function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function varRe(name: string) { return new RegExp(`\\[\\[?${name}\\]\\]?`, "gi"); }

export function applyVariables(content: string, ctx: {
  roles: Record<string, CrmPerson>; contact: CrmPerson | null; deal: Record<string, string>;
  custom: Record<string, string>; templateName: string; now: Date;
}): string {
  let r = content || "";
  for (const [ref, c] of Object.entries(ctx.roles)) {
    const n = esc(ref);
    const pairs: [string, string][] = [
      ["FirstName", c.first_name], ["LastName", c.last_name], ["FullName", c.name], ["Name", c.name],
      ["Email", c.email], ["Phone", c.phone], ["Mobile", c.phone], ["Company", c.company ?? ""],
      ["Street", c.street ?? ""], ["City", c.city ?? ""], ["State", c.state ?? ""], ["Zip", c.zip ?? ""],
      ["Country", c.country ?? ""], ["JobTitle", c.job_title ?? ""],
    ];
    for (const [k, v] of pairs) r = r.replace(varRe(`${n}\\.${k}`), v || "");
  }
  const c = ctx.contact;
  if (c) {
    const pairs: [string, string][] = [
      ["FirstName", c.first_name], ["LastName", c.last_name], ["FullName", c.name], ["Email", c.email],
      ["Phone", c.phone], ["Mobile", c.phone], ["Company", c.company ?? ""], ["MailingStreet", c.street ?? ""],
      ["MailingCity", c.city ?? ""], ["MailingState", c.state ?? ""], ["MailingZip", c.zip ?? ""],
      ["MailingCountry", c.country ?? ""], ["JobTitle", c.job_title ?? ""],
    ];
    for (const [k, v] of pairs) r = r.replace(varRe(`Contact\\.${k}`), v || "");
  }
  for (const k of ["Name", "Amount", "Stage", "ClosingDate", "Probability", "Description"]) {
    r = r.replace(varRe(`Deal\\.${k}`), ctx.deal[k] || "");
  }
  const now = ctx.now;
  const sp = { timeZone: "America/Sao_Paulo" } as const;
  r = r.replace(varRe("Document\\.CreatedDate"), now.toLocaleDateString("pt-BR", sp))
    .replace(varRe("Document\\.CreatedDateTime"), now.toLocaleString("pt-BR", sp))
    .replace(varRe("Document\\.SentDate"), now.toLocaleDateString("pt-BR", sp))
    .replace(varRe("Document\\.Year"), String(now.getFullYear()))
    .replace(varRe("Document\\.Month"), String(now.getMonth() + 1).padStart(2, "0"))
    .replace(varRe("Document\\.Day"), String(now.getDate()).padStart(2, "0"))
    .replace(varRe("Document\\.Title"), ctx.templateName || "")
    .replace(varRe("Document\\.Id"), "").replace(varRe("Document\\.RefNumber"), "")
    .replace(varRe("Document\\.ExpirationDate"), "");
  for (const [k, v] of Object.entries(ctx.custom)) r = r.replace(varRe(`Custom\\.${esc(k)}`), v || "");
  return r;
}

// Substitui variáveis SOMENTE em blocos text/heading do frozen_content (estrutura/layout intactos).
export function fillFrozenContent(frozen: Any, ctx: Parameters<typeof applyVariables>[1]): Any {
  const clone = JSON.parse(JSON.stringify(frozen));
  for (const page of clone.pages ?? []) {
    for (const b of page.blocks ?? []) {
      if ((b?.type === "text" || b?.type === "heading") && typeof b.content === "string") {
        b.content = applyVariables(b.content, ctx);
      }
    }
  }
  return clone;
}

// Placeholders suportados que sobraram após applyVariables (lista deduplicada).
export function findUnresolvedPlaceholders(frozen: Any, roleRefs: string[] = []): string[] {
  const ns = ["Custom", "Contact", "Client", "Deal", "Document", ...roleRefs.map(esc)];
  const re = new RegExp(`\\[\\[?((?:${ns.join("|")})\\.[A-Za-z0-9_À-ÿ]+)\\]\\]?`, "gi");
  const found = new Set<string>();
  const walk = (x: Any) => {
    if (typeof x === "string") { if (!x.startsWith("data:")) for (const m of x.matchAll(re)) found.add(m[1]); }
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(frozen);
  return [...found];
}

export function friendlyTemplateError(code: string | undefined): string {
  if (code === "template_not_v2_compatible" || code === "template_has_no_v2_definition" || code === "template_has_invalid_fields") {
    return "Este modelo ainda não é compatível com o novo fluxo de assinatura.";
  }
  return "Não foi possível carregar o modelo na SuvSign.";
}

// ---------- Multidocumento: participantes únicos da operação ----------
// A identidade vem da pessoa REAL (contact:<id> / user:<id> / manual:<email>),
// nunca do ref local do template. Refs da operação: p1, p2, ...
export interface ResolvedSignatory {
  template_ref: string; identity: string;
  person: { name: string; email: string; phone: string | null; cpf: string | null };
  template_role: string | null;
}
export interface TemplateDocInput {
  template_id: string; title: string; frozen_content: Any; signatories: ResolvedSignatory[]; fields: Any[];
}
export function buildMultiDocument(docs: TemplateDocInput[]) {
  const byIdentity = new Map<string, Any>();
  const participants: Any[] = [];
  const documents = docs.map((d, di) => {
    const refMap = new Map<string, string>();
    for (const s of d.signatories) {
      let p = byIdentity.get(s.identity);
      if (!p) {
        p = { ref: `p${participants.length + 1}`, identity: s.identity, name: s.person.name || s.person.email,
          email: s.person.email, phone: s.person.phone, cpf: s.person.cpf, role: "signer",
          template_role: s.template_role, order_index: participants.length };
        byIdentity.set(s.identity, p); participants.push(p);
      } else if (p.email.toLowerCase() !== s.person.email.toLowerCase()) {
        throw new Error(`participant_email_mismatch:${s.identity}`);
      }
      refMap.set(s.template_ref, p.ref);
    }
    const fields = (d.fields ?? []).filter((f: Any) => refMap.has(f.template_signatory_ref)).map((f: Any) => ({
      participant_ref: refMap.get(f.template_signatory_ref), field_type: f.field_type, label: f.label ?? null,
      page_number: f.page_number, position_x: f.position_x, position_y: f.position_y, width: f.width, height: f.height,
      is_required: f.is_required !== false, metadata: f.metadata ?? {},
    }));
    return { ref: `d${di + 1}`, title: d.title, template_id: d.template_id, frozen_content: d.frozen_content, fields };
  });
  return { participants, documents };
}
