import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "./integration-credentials.ts";

Deno.test("integration credentials encrypt at rest and decrypt losslessly", async () => {
  Deno.env.set(
    "INTEGRATION_CREDENTIALS_KEY",
    "test-only-encryption-key-with-at-least-32-characters",
  );
  const secret = "shared-test-secret-with-at-least-32-characters";
  const first = await encryptIntegrationSecret(secret);
  const second = await encryptIntegrationSecret(secret);

  if (first === second) throw new Error("random IV was not applied");
  if (first.includes(secret)) throw new Error("ciphertext leaked plaintext");
  if (await decryptIntegrationSecret(first) !== secret) {
    throw new Error("decrypted value differs from source");
  }
});
