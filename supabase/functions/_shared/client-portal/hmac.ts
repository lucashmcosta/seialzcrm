// Assinatura HMAC do App do cliente: "sha256=<hex>" de "{timestamp}.{corpo}".
// Mesmo esquema da client-portal-otp-send (que segue com cópia própria, intocada).
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
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

export async function verifySignature(p: {
  secret: string | undefined;
  timestampHeader: string | null;
  signatureHeader: string | null;
  rawBody: string;
  nowSeconds: number;
}): Promise<boolean> {
  if (!p.secret || !p.timestampHeader || !p.signatureHeader) return false;
  if (!/^\d{1,12}$/.test(p.timestampHeader)) return false;
  if (Math.abs(p.nowSeconds - Number(p.timestampHeader)) > MAX_TIMESTAMP_SKEW_SECONDS) return false;
  if (!p.signatureHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + (await hmacSha256Hex(p.secret, `${p.timestampHeader}.${p.rawBody}`));
  return timingSafeEqual(expected, p.signatureHeader.toLowerCase());
}

export async function signHeaders(secret: string, rawBody: string, nowSeconds: number) {
  const ts = String(nowSeconds);
  return {
    "x-portal-timestamp": ts,
    "x-portal-signature": "sha256=" + (await hmacSha256Hex(secret, `${ts}.${rawBody}`)),
  };
}
