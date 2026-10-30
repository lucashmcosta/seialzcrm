import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildMetaTemplatePayload,
  hmacSha256Hex,
  maskPhone,
  pickEligible,
  validateInput,
  verifySignature,
} from "./logic.ts";

const SECRET = "test-secret";
const BODY = '{"seialz_contact_ids":["11111111-1111-1111-1111-111111111111"],"code":"123456"}';
const NOW = 1_800_000_000;

async function sig(ts: number, body = BODY, secret = SECRET) {
  return "sha256=" + (await hmacSha256Hex(secret, `${ts}.${body}`));
}

Deno.test("assinatura válida", async () => {
  assert(await verifySignature({ secret: SECRET, timestampHeader: String(NOW), signatureHeader: await sig(NOW), rawBody: BODY, nowSeconds: NOW }));
});

Deno.test("assinatura inválida (segredo errado, corpo alterado, ausente)", async () => {
  assert(!(await verifySignature({ secret: SECRET, timestampHeader: String(NOW), signatureHeader: await sig(NOW, BODY, "other"), rawBody: BODY, nowSeconds: NOW })));
  assert(!(await verifySignature({ secret: SECRET, timestampHeader: String(NOW), signatureHeader: await sig(NOW), rawBody: BODY + " ", nowSeconds: NOW })));
  assert(!(await verifySignature({ secret: SECRET, timestampHeader: String(NOW), signatureHeader: null, rawBody: BODY, nowSeconds: NOW })));
  assert(!(await verifySignature({ secret: undefined, timestampHeader: String(NOW), signatureHeader: await sig(NOW), rawBody: BODY, nowSeconds: NOW })));
});

Deno.test("assinatura expirada (>300 s) e no limite", async () => {
  const old = NOW - 301;
  assert(!(await verifySignature({ secret: SECRET, timestampHeader: String(old), signatureHeader: await sig(old), rawBody: BODY, nowSeconds: NOW })));
  const future = NOW + 301;
  assert(!(await verifySignature({ secret: SECRET, timestampHeader: String(future), signatureHeader: await sig(future), rawBody: BODY, nowSeconds: NOW })));
  const edge = NOW - 300;
  assert(await verifySignature({ secret: SECRET, timestampHeader: String(edge), signatureHeader: await sig(edge), rawBody: BODY, nowSeconds: NOW }));
});

Deno.test("validação de entrada", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  assertEquals(validateInput({ seialz_contact_ids: [id], code: "123456" }), { contactIds: [id], code: "123456" });
  assertEquals(validateInput({ seialz_contact_ids: [id], code: "12345" }), null);
  assertEquals(validateInput({ seialz_contact_ids: [id], code: "1234567" }), null);
  assertEquals(validateInput({ seialz_contact_ids: [id], code: "12a456" }), null);
  assertEquals(validateInput({ seialz_contact_ids: [id], code: 123456 }), null);
  assertEquals(validateInput({ seialz_contact_ids: [], code: "123456" }), null);
  assertEquals(validateInput({ seialz_contact_ids: Array(6).fill(id), code: "123456" }), null);
  assertEquals(validateInput({ seialz_contact_ids: ["nao-uuid"], code: "123456" }), null);
  assertEquals(validateInput(null), null);
});

Deno.test("escolhe telefone da thread com last_inbound_at mais recente", () => {
  const contacts = [
    { id: "a", phone: "+55 11 98765-1111" },
    { id: "b", phone: "+5521987652222" },
    { id: "c", phone: null },
  ];
  const threads = [
    { contact_id: "a", last_inbound_at: "2026-10-01T10:00:00Z" },
    { contact_id: "b", last_inbound_at: "2026-10-20T10:00:00Z" },
    { contact_id: "c", last_inbound_at: "2026-10-29T10:00:00Z" },
    { contact_id: "a", last_inbound_at: null },
  ];
  assertEquals(pickEligible(contacts, threads), { contactId: "b", phone: "5521987652222" });
  assertEquals(pickEligible(contacts, [{ contact_id: "a", last_inbound_at: null }]), null);
  assertEquals(pickEligible([{ id: "a", phone: "+5511987651111" }], []), null);
});

Deno.test("máscara do destino", () => {
  assertEquals(maskPhone("5511987651234"), "(11) *****-1234");
});

Deno.test("payload Meta com código no body e no botão", () => {
  const p = buildMetaTemplatePayload({ to: "5511987651234", templateName: "codigo_acesso_app", language: "pt_BR", code: "654321" }) as any;
  assertEquals(p.type, "template");
  assertEquals(p.to, "5511987651234");
  assertEquals(p.template.name, "codigo_acesso_app");
  assertEquals(p.template.language, { code: "pt_BR" });
  assertEquals(p.template.components[0], { type: "body", parameters: [{ type: "text", text: "654321" }] });
  assertEquals(p.template.components[1], { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "654321" }] });
});
