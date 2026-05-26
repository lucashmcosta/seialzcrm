// AES-256-GCM helpers for symmetric secret encryption.
// Format: v1:{iv_b64}:{ciphertext_b64}
// Key source: META_TOKEN_ENCRYPTION_KEY.
// Compatibility order:
// 1) 64 hex chars -> 32 raw bytes
// 2) 32 raw chars -> UTF-8 bytes
// 3) base64 for 32 bytes
// 4) legacy fallback: SHA-256 of the configured secret string

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().replace(/^0x/i, "").replace(/[^0-9a-f]/gi, "");
  if (clean.length !== 64) return null;
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

function raw32ToBytes(secret: string): Uint8Array | null {
  const bytes = new TextEncoder().encode(secret.trim());
  return bytes.length === 32 ? bytes : null;
}

function b64To32Bytes(secret: string): Uint8Array | null {
  try {
    const bytes = b64decode(secret.trim());
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

async function hashSecretToBytes(secret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret.trim()));
  return new Uint8Array(digest);
}

function bytesKey(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveKeyCandidates(secret: string): Promise<Uint8Array[]> {
  const trimmed = secret.trim();
  const candidates: Uint8Array[] = [];
  const seen = new Set<string>();

  const push = (bytes: Uint8Array | null) => {
    if (!bytes) return;
    const key = bytesKey(bytes);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(bytes);
  };

  push(hexToBytes(trimmed));
  push(raw32ToBytes(trimmed));
  push(b64To32Bytes(trimmed));
  push(await hashSecretToBytes(trimmed));

  return candidates;
}

async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  if (!secret) throw new Error("META_TOKEN_ENCRYPTION_KEY not configured");
  const candidates = await resolveKeyCandidates(secret);
  if (candidates.length === 0) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY is empty or invalid");
  }
  return await importKey(candidates[0]);
}

async function getDecryptionKeys(): Promise<CryptoKey[]> {
  const secret = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  if (!secret) throw new Error("META_TOKEN_ENCRYPTION_KEY not configured");
  const candidates = await resolveKeyCandidates(secret);
  if (candidates.length === 0) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY is empty or invalid");
  }
  return await Promise.all(candidates.map((candidate) => importKey(candidate)));
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
  const keys = await getDecryptionKeys();

  let lastError: unknown;
  for (const key of keys) {
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
      return new TextDecoder().decode(pt);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to decrypt payload");
}
