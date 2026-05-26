// Deno tests for crypto.ts — AES-GCM roundtrip and tamper detection.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Set a deterministic 32-byte key BEFORE importing the module.
const TEST_KEY = "a".repeat(64); // 32 bytes hex
Deno.env.set("META_TOKEN_ENCRYPTION_KEY", TEST_KEY);

const { encryptSecret, decryptSecret } = await import("./crypto.ts");

Deno.test("encryptSecret/decryptSecret roundtrip", async () => {
  const pt = "sk-my-very-secret-api-key-1234567890";
  const ct = await encryptSecret(pt);
  assert(ct.startsWith("v1:"), "ciphertext must use v1 prefix");
  assert(!ct.includes(pt), "ciphertext must not contain plaintext");
  const back = await decryptSecret(ct);
  assertEquals(back, pt);
});

Deno.test("encryptSecret produces different ciphertext for same input (random IV)", async () => {
  const pt = "same-input";
  const c1 = await encryptSecret(pt);
  const c2 = await encryptSecret(pt);
  assert(c1 !== c2, "IV randomness must change ciphertext per call");
});

Deno.test("decryptSecret rejects malformed payload", async () => {
  await assertRejects(() => decryptSecret("not-encrypted"));
  await assertRejects(() => decryptSecret("v2:foo:bar"));
});

Deno.test("decryptSecret rejects tampered ciphertext (GCM auth tag)", async () => {
  const ct = await encryptSecret("hello");
  const parts = ct.split(":");
  // flip a character in the ciphertext segment
  const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}AA`;
  await assertRejects(() => decryptSecret(tampered));
});

Deno.test("encryptSecret throws when key not configured", async () => {
  const prev = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  Deno.env.delete("META_TOKEN_ENCRYPTION_KEY");
  try {
    await assertRejects(() => encryptSecret("x"));
  } finally {
    if (prev) Deno.env.set("META_TOKEN_ENCRYPTION_KEY", prev);
  }
});

Deno.test("encryptSecret accepts a 32-char raw key", async () => {
  const prev = Deno.env.get("META_TOKEN_ENCRYPTION_KEY");
  Deno.env.set("META_TOKEN_ENCRYPTION_KEY", "12345678901234567890123456789012");
  try {
    const ct = await encryptSecret("hello");
    const back = await decryptSecret(ct);
    assertEquals(back, "hello");
  } finally {
    if (prev) Deno.env.set("META_TOKEN_ENCRYPTION_KEY", prev);
  }
});
