// Deno tests for pure helpers in byok-shared.ts.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fingerprint, isSupported, last4, SUPPORTED_PROVIDERS } from "./byok-shared.ts";

Deno.test("isSupported only accepts known providers", () => {
  for (const p of SUPPORTED_PROVIDERS) assert(isSupported(p));
  assert(!isSupported("rogue"));
  assert(!isSupported(""));
  assert(!isSupported("OPENAI")); // lowercase contract
});

Deno.test("last4 returns the trailing 4 chars only", () => {
  assertEquals(last4("sk-abcdef1234"), "1234");
  assertEquals(last4("xyz"), "xyz");
});

Deno.test("fingerprint is sha256-prefixed and deterministic, never contains key", async () => {
  const k = "sk-supersecret-1234567890";
  const f1 = await fingerprint(k);
  const f2 = await fingerprint(k);
  assertEquals(f1, f2);
  assert(f1.startsWith("sha256:"));
  assert(!f1.includes(k));
  const f3 = await fingerprint("different-key");
  assert(f1 !== f3);
});
