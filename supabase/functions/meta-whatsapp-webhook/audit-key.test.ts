import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { inboundEventKey, isDuplicateAuditError } from "./audit-key.ts";

Deno.test("cada status da mesma mensagem tem chave própria", () => {
  const base = { kind: "status" as const, wamid: "wamid.1" };
  assertNotEquals(inboundEventKey({ ...base, messageType: "sent" }), inboundEventKey({ ...base, messageType: "delivered" }));
  assertEquals(inboundEventKey({ ...base, messageType: "read" }), "meta:wamid.1:status:read");
});

Deno.test("reenvio do mesmo status dá a mesma chave", () => {
  const a = { kind: "status" as const, wamid: "wamid.1", messageType: "read" };
  assertEquals(inboundEventKey(a), inboundEventKey(a));
});

Deno.test("mensagem mantém a chave de antes", () => {
  assertEquals(inboundEventKey({ kind: "message", wamid: "wamid.1", messageType: "text" }), "meta:wamid.1");
  assert(inboundEventKey({ kind: "message", wamid: null, messageType: null }).startsWith("meta:"));
});

Deno.test("só chave duplicada é tratada como reenvio", () => {
  assertEquals(isDuplicateAuditError({ code: "23505" }), true);
  assertEquals(isDuplicateAuditError({ code: "42P01" }), false);
  assertEquals(isDuplicateAuditError(null), false);
});
