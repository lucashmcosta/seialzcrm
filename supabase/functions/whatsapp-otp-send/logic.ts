// Lógica pura do whatsapp-otp-send (sem I/O), testável em Deno.
import { verifySignature } from "../_shared/client-portal/hmac.ts";
export { verifySignature };

export const FORBIDDEN_ENDPOINT_ID = "407ff93d-4860-49cd-82ae-beda456c1774"; // 7020 histórico
export const MAX_SENDS_PER_HOUR = 5;

// organization_id -> nome do secret HMAC daquela org. Nova org = nova linha + secret.
export const ORG_SECRET_NAMES: Record<string, string> = {
  "4bba3f19-b17e-4205-b495-68e62f62f41b": "AUXILIUS_OTP_HMAC_SECRET", // Auxilius
};

export function secretNameForOrg(orgId: unknown): string | null {
  return typeof orgId === "string" && Object.hasOwn(ORG_SECRET_NAMES, orgId) ? ORG_SECRET_NAMES[orgId] : null;
}

export function peekOrgId(raw: string): string | null {
  try {
    const b = JSON.parse(raw);
    return b && typeof b === "object" && typeof b.organization_id === "string" ? b.organization_id : null;
  } catch { return null; }
}

export type OtpInput = { organizationId: string; phoneDigits: string; code: string; template: string; language: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateInput(b: unknown): OtpInput | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const { organization_id, phone_e164, code, template, language } = o;
  if (typeof organization_id !== "string" || !UUID.test(organization_id)) return null;
  if (typeof phone_e164 !== "string" || !/^\+[1-9]\d{7,14}$/.test(phone_e164)) return null;
  if (typeof code !== "string" || !/^[A-Za-z0-9]{4,15}$/.test(code)) return null;
  if (typeof template !== "string" || !/^[a-z0-9_]{1,512}$/.test(template)) return null;
  if (typeof language !== "string" || !/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) return null;
  return { organizationId: organization_id, phoneDigits: phone_e164.slice(1), code, template, language };
}

export function isRateLimited(countLastHour: number): boolean {
  return countLastHour >= MAX_SENDS_PER_HOUR;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function buildPayload(p: { to: string; template: string; language: string; code: string }) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: p.to,
    type: "template",
    template: {
      name: p.template,
      language: { code: p.language },
      components: [
        { type: "body", parameters: [{ type: "text", text: p.code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: p.code }] },
      ],
    },
  };
}
