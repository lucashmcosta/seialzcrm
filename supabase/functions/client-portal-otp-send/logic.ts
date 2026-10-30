// Funções puras da client-portal-otp-send (sem I/O, testáveis).
// NUNCA logar o código, o telefone completo ou o corpo da requisição.

export const FORBIDDEN_ENDPOINT_ID = "407ff93d-4860-49cd-82ae-beda456c1774"; // 7020 histórico
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;
export const MAX_SENDS_PER_HOUR = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export async function verifySignature(params: {
  secret: string | undefined;
  timestampHeader: string | null;
  signatureHeader: string | null;
  rawBody: string;
  nowSeconds: number;
}): Promise<boolean> {
  const { secret, timestampHeader, signatureHeader, rawBody, nowSeconds } = params;
  if (!secret || !timestampHeader || !signatureHeader) return false;
  if (!/^\d{1,12}$/.test(timestampHeader)) return false;
  const ts = Number(timestampHeader);
  if (Math.abs(nowSeconds - ts) > MAX_TIMESTAMP_SKEW_SECONDS) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + (await hmacSha256Hex(secret, `${timestampHeader}.${rawBody}`));
  return timingSafeEqual(expected, signatureHeader.toLowerCase());
}

export type ValidInput = { contactIds: string[]; code: string };

export function validateInput(body: unknown): ValidInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.code !== "string" || !/^\d{6}$/.test(b.code)) return null;
  const ids = b.seialz_contact_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5) return null;
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) return null;
  return { contactIds: Array.from(new Set(ids as string[])), code: b.code };
}

export type ContactRow = { id: string; phone: string | null };
export type ThreadRow = { contact_id: string; last_inbound_at: string | null };

/** Escolhe o contato/telefone cuja thread WhatsApp tem o last_inbound_at mais recente. */
export function pickEligible(
  contacts: ContactRow[],
  threads: ThreadRow[],
): { contactId: string; phone: string } | null {
  const phoneById = new Map<string, string>();
  for (const c of contacts) {
    const digits = (c.phone ?? "").replace(/\D/g, "");
    if (digits.length >= 8) phoneById.set(c.id, digits);
  }
  let best: { contactId: string; phone: string; at: number } | null = null;
  for (const t of threads) {
    if (!t.last_inbound_at) continue;
    const phone = phoneById.get(t.contact_id);
    if (!phone) continue;
    const at = Date.parse(t.last_inbound_at);
    if (Number.isNaN(at)) continue;
    if (!best || at > best.at) best = { contactId: t.contact_id, phone, at };
  }
  return best ? { contactId: best.contactId, phone: best.phone } : null;
}

export function maskPhone(digits: string): string {
  const last4 = digits.slice(-4);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `(${digits.slice(2, 4)}) *****-${last4}`;
  }
  return `*****-${last4}`;
}

export function buildMetaTemplatePayload(params: {
  to: string;
  templateName: string;
  language: string;
  code: string;
}): Record<string, unknown> {
  const { to, templateName, language, code } = params;
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
}
