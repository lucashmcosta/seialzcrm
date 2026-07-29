const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function encryptionKey(): Promise<CryptoKey> {
  const material = Deno.env.get("INTEGRATION_CREDENTIALS_KEY");
  if (!material || material.length < 32) {
    throw new Error("INTEGRATION_CREDENTIALS_KEY must contain at least 32 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptIntegrationSecret(secret: string): Promise<string> {
  const normalized = secret.trim();
  if (normalized.length < 32) throw new Error("Integration secret must contain at least 32 characters");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(normalized),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptIntegrationSecret(ciphertext: string): Promise<string> {
  const [version, ivValue, encryptedValue] = ciphertext.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) {
    throw new Error("Unsupported integration credential format");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    await encryptionKey(),
    base64ToBytes(encryptedValue),
  );
  return decoder.decode(decrypted);
}

// deno-lint-ignore no-explicit-any
export async function loadActiveIntegrationSecret(
  supabase: any,
  organizationId: string,
  keyId?: string | null,
): Promise<{ keyId: string; secret: string } | null> {
  let query = supabase
    .from("nammux_integration_credentials")
    .select("key_id, secret_ciphertext, valid_from, expires_at, is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .lte("valid_from", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (keyId) query = query.eq("key_id", keyId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`credential_lookup_failed: ${error.message}`);
  if (!data || (data.expires_at && new Date(data.expires_at).getTime() <= Date.now())) return null;
  return {
    keyId: data.key_id,
    secret: await decryptIntegrationSecret(data.secret_ciphertext),
  };
}
