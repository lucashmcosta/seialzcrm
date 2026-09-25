import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { applyVariables, canonicalJson, fillFrozenContent, hmacHex, sha256Hex, timingSafeEqualHex, mapOperationStatus } from "./suvsign-v2.ts";

const person = { first_name: "Ana", last_name: "Silva", name: "Ana Silva", email: "ana@x.com", phone: "+5511999999999" };
const ctx = { roles: { client: person }, contact: person, deal: {}, custom: { cpf: "123", deal_title: "Visto" }, templateName: "Proc", now: new Date("2026-09-24T12:00:00Z") };

Deno.test("canonical hash é estável independente da ordem das chaves", async () => {
  assertEquals(await sha256Hex(canonicalJson({ a: 1, b: { c: 2, d: 3 } })), await sha256Hex(canonicalJson({ b: { d: 3, c: 2 }, a: 1 })));
  assertNotEquals(await sha256Hex(canonicalJson({ a: 1 })), await sha256Hex(canonicalJson({ a: 2 })));
});

Deno.test("variáveis V1: role, Contact, Custom, [[ ]] e case-insensitive", () => {
  const out = applyVariables("[client.FullName] [[Contact.Email]] [custom.cpf] [Custom.deal_title] [Document.Year]", ctx);
  assertEquals(out, "Ana Silva ana@x.com 123 Visto 2026");
});

Deno.test("fillFrozenContent só altera text/heading e preserva layout", () => {
  const frozen = { layout_mode: "legacy_template_816x1056", pages: [{ id: "p1", blocks: [
    { type: "text", content: "Olá [Contact.FirstName]" }, { type: "heading", content: "[Deal.Name]" }, { type: "signature", content: "[Contact.FirstName]" }] }] };
  const f = fillFrozenContent(frozen, ctx);
  assertEquals(f.layout_mode, "legacy_template_816x1056");
  assertEquals(f.pages[0].blocks[0].content, "Olá Ana");
  assertEquals(f.pages[0].blocks[1].content, "");
  assertEquals(f.pages[0].blocks[2].content, "[Contact.FirstName]");
  assertEquals(frozen.pages[0].blocks[0].content, "Olá [Contact.FirstName]"); // original imutável
});

Deno.test("HMAC novo (timestamp.body) e legado", async () => {
  const body = '{"event":"document.completed"}';
  const legacy = await hmacHex("s3cret", body);
  const ts = "2026-09-24T12:00:00Z";
  const neu = await hmacHex("s3cret", `${ts}.${body}`);
  assertEquals(timingSafeEqualHex(legacy, await hmacHex("s3cret", body)), true);
  assertEquals(timingSafeEqualHex(neu, legacy), false);
  assertEquals(timingSafeEqualHex(legacy, await hmacHex("outro", body)), false);
});

Deno.test("status do provedor → 6 estados locais", () => {
  for (const s of ["draft", "sent", "in_progress", "completing", "completed", "cancelled"]) assertEquals(mapOperationStatus(s), s);
  assertEquals(mapOperationStatus("weird"), null);
});

import { buildMultiDocument as _bmd } from "./suvsign-v2.ts";
Deno.test("multidoc: mesmo contato com refs diferentes vira 1 participante", () => {
  const joao = { name: "João", email: "joao@x.com", phone: null, cpf: "1" };
  const f = (ref: string) => ({ template_signatory_ref: ref, field_type: "signature", page_number: 1, position_x: 1, position_y: 1, width: 1, height: 1 });
  const out = _bmd([
    { template_id: "A", title: "A", frozen_content: {}, signatories: [{ template_ref: "role-client", identity: "contact:c1", person: joao, template_role: null }], fields: [f("role-client")] },
    { template_id: "B", title: "B", frozen_content: {}, signatories: [{ template_ref: "client", identity: "contact:c1", person: joao, template_role: null }], fields: [f("client")] },
  ]);
  if (out.participants.length !== 1) throw new Error("participants");
  if (out.documents.length !== 2) throw new Error("documents");
  const refs = out.documents.flatMap((d) => d.fields.map((x: any) => x.participant_ref));
  if (refs.length !== 2 || refs.some((r) => r !== "p1")) throw new Error("refs " + refs);
});
