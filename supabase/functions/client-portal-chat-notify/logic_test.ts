import { assert, assertEquals } from "jsr:@std/assert@1";
import { isStale, pickRecipients, shouldNotify, validateNotify } from "./logic.ts";
import { hmacSha256Hex, verifySignature } from "../_shared/client-portal/hmac.ts";

const ok = {
  organizationId: "40ae935c-a7f7-4ad7-8ea4-91be6404a95f",
  conversationId: "11111111-1111-1111-1111-111111111111",
  seialzContactId: "22222222-2222-2222-2222-222222222222",
  event: "message.created", lastMessageAt: "2026-11-03T12:00:00Z", lastFrom: "client", unreadForStaff: 2,
};

Deno.test("aceita aviso válido e recusa formatos errados", () => {
  assert(validateNotify(ok));
  assertEquals(validateNotify({ ...ok, event: "x" }), null);
  assertEquals(validateNotify({ ...ok, unreadForStaff: -1 }), null);
  assertEquals(validateNotify({ ...ok, conversationId: "abc" }), null);
});

Deno.test("só notifica mensagem nova do cliente", () => {
  assert(shouldNotify({ event: "message.created", lastFrom: "client" }));
  assert(!shouldNotify({ event: "message.created", lastFrom: "staff" }));
  assert(!shouldNotify({ event: "conversation.updated", lastFrom: "client" }));
});

Deno.test("com responsável só ele; sem responsável todos do Atendimento", () => {
  assertEquals(pickRecipients("u1", ["u2", "u3"]), ["u1"]);
  assertEquals(pickRecipients(null, ["u2", "u3", "u2"]), ["u2", "u3"]);
});

Deno.test("aviso mais antigo é ignorado", () => {
  assert(isStale("2026-11-03T12:00:00Z", "2026-11-03T11:00:00Z"));
  assert(!isStale("2026-11-03T12:00:00Z", "2026-11-03T12:00:00Z"));
  assert(!isStale(null, "2026-11-03T11:00:00Z"));
});

Deno.test("assinatura errada ou vencida é recusada", async () => {
  const now = 1_800_000_000, body = "{}";
  const sig = "sha256=" + (await hmacSha256Hex("s", `${now}.${body}`));
  assert(await verifySignature({ secret: "s", timestampHeader: String(now), signatureHeader: sig, rawBody: body, nowSeconds: now }));
  assert(!(await verifySignature({ secret: "x", timestampHeader: String(now), signatureHeader: sig, rawBody: body, nowSeconds: now })));
  assert(!(await verifySignature({ secret: "s", timestampHeader: String(now), signatureHeader: sig, rawBody: body, nowSeconds: now + 301 })));
});
