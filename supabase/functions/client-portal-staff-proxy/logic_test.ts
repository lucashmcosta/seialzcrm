import { assert, assertEquals } from "jsr:@std/assert@1";
import { ALLOWED_OPS, buildStaffBody, isAllowedOp, sanitizeParams } from "./logic.ts";

const staff = { userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayName: "Ana" };
const conv = "11111111-1111-1111-1111-111111111111";

Deno.test("só as 8 operações passam", () => {
  assertEquals(ALLOWED_OPS.length, 8);
  assert(isAllowedOp("messages.send"));
  assert(!isAllowedOp("conversations.delete"));
  assert(!isAllowedOp(undefined));
});

Deno.test("organizationId e staff do navegador são descartados", () => {
  const p = sanitizeParams("conversation.read", { conversationId: conv, organizationId: "x", staff: { userId: "y" } }, staff)!;
  const sent = JSON.parse(buildStaffBody("org", staff, "conversation.read", p));
  assertEquals(sent.organizationId, "org");
  assertEquals(sent.staff, staff);
});

Deno.test("atribuir só a si mesmo ou remover", () => {
  assert(sanitizeParams("conversation.assign", { conversationId: conv, assignee: { userId: staff.userId } }, staff));
  assert(sanitizeParams("conversation.assign", { conversationId: conv, assignee: null }, staff));
  assertEquals(sanitizeParams("conversation.assign", { conversationId: conv, assignee: { userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" } }, staff), null);
});

Deno.test("anexo: só jpeg/png/pdf até 10 MB", () => {
  const base = { conversationId: conv, name: "a.pdf", mimeType: "application/pdf", size: 1000 };
  assert(sanitizeParams("attachment.prepare", base, staff));
  assertEquals(sanitizeParams("attachment.prepare", { ...base, mimeType: "image/heic" }, staff), null);
  assertEquals(sanitizeParams("attachment.prepare", { ...base, size: 10 * 1024 * 1024 + 1 }, staff), null);
});

Deno.test("envio exige texto ou anexo e id de idempotência", () => {
  const id = "33333333-3333-3333-3333-333333333333";
  assert(sanitizeParams("messages.send", { conversationId: conv, clientMessageId: id, body: "oi" }, staff));
  assertEquals(sanitizeParams("messages.send", { conversationId: conv, clientMessageId: id, body: "  " }, staff), null);
  assertEquals(sanitizeParams("messages.send", { conversationId: conv, body: "oi" }, staff), null);
});
