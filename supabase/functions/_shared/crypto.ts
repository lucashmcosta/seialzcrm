// AES-256-GCM helpers for symmetric secret encryption.
// Format: v1:{iv_b64}:{ciphertext_b64}
// Key source: META_TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes)

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length !== 64) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  if (!keyHex) throw new Error("META_TOKEN_ENCRYPTION_KEY not configured");
  const raw = hexToBytes(keyHex);
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc),
  );
  return `v1:${b64encode(iv)}:${b64encode(ct)}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = b64decode(parts[1]);
  const ct = b64decode(parts[2]);
  const key = await getKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
