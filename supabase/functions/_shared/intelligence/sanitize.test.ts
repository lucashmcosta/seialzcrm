// Deno tests for sanitize.ts — no-leak guarantees.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  redact,
  sanitizeProviderError,
  classifyHttpStatus,
} from "./sanitize.ts";

Deno.test("redact() masks OpenAI-style sk- keys in strings", () => {
  const input = "calling provider with sk-abcdefghijklmnop1234 ok";
  const out = redact(input) as string;
  assertStringIncludes(out, "[REDACTED]");
  assert(!out.includes("sk-abcdefghijklmnop1234"));
});

Deno.test("redact() masks AES-GCM ciphertext (v1:iv:ct)", () => {
  const ct = "v1:AAAAAAAAAAAAAAAAAAAA==:BBBBBBBBBBBBBBBBBBBBBBBBBBBB==";
  const out = redact(`payload=${ct}`) as string;
  assert(!out.includes("AAAAAAAAAAAAAAAAAAAA"));
  assertStringIncludes(out, "[REDACTED]");
});

Deno.test("redact() masks Bearer tokens", () => {
  const out = redact("Authorization: Bearer abcdefghijklmnopqrstuvwxyz") as string;
  assertStringIncludes(out, "[REDACTED]");
});

Deno.test("redact() recursively redacts sensitive object keys", () => {
  const input = {
    safe: "ok",
    api_key: "sk-supersecret-1234567890",
    nested: { token: "ey.j.w.t", ciphertext: "v1:aaa:bbb" },
    arr: [{ password: "p@ss" }],
  };
  const out = redact(input) as any;
  assertEquals(out.safe, "ok");
  assertEquals(out.api_key, "[REDACTED]");
  assertEquals(out.nested.token, "[REDACTED]");
  assertEquals(out.nested.ciphertext, "[REDACTED]");
  assertEquals(out.arr[0].password, "[REDACTED]");
});

Deno.test("redact() does not leak even when key value embedded in nested string", () => {
  const out = redact({ message: "leaked sk-abcdefghijklmnop1234 here" }) as any;
  assert(!JSON.stringify(out).includes("sk-abcdefghijklmnop1234"));
});

Deno.test("classifyHttpStatus() maps codes to kinds", () => {
  assertEquals(classifyHttpStatus(401), "invalid_key");
  assertEquals(classifyHttpStatus(403), "invalid_key");
  assertEquals(classifyHttpStatus(429), "rate_limit");
  assertEquals(classifyHttpStatus(402), "budget");
  assertEquals(classifyHttpStatus(500), "transient");
  assertEquals(classifyHttpStatus(400), "bad_request");
});

Deno.test("sanitizeProviderError() returns generic message, never leaks body", () => {
  const raw = {
    error: {
      code: "invalid_api_key",
      message: "Your key sk-leaked123456789012345 is bad",
    },
  };
  const r = sanitizeProviderError(401, raw);
  assertEquals(r.kind, "invalid_key");
  assertEquals(r.code, "invalid_api_key");
  assert(!r.message.includes("sk-leaked"));
  assert(!r.message.toLowerCase().includes("your key"));
});

Deno.test("sanitizeProviderError() handles non-JSON body safely", () => {
  const r = sanitizeProviderError(500, "<html>boom sk-xxxxxxxxxxxxxxxx</html>");
  assertEquals(r.kind, "transient");
  assert(!r.message.includes("sk-"));
});
