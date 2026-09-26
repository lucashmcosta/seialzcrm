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

import { resolveTemplateSignatories as _rts } from "./suvsign-v2.ts";
const cli = { first_name: "Joao", last_name: "Teste", name: "Joao Teste", email: "joao@x.com", phone: "" };
const base = { client: cli, contactId: "c1", contactCpf: "1", me: { id: "u1", full_name: "Op", email: "op@x.com" }, extras: { "80b476d9": { name: "Kaik", email: "kaik@x.com" } } };
const fld = (ref: string) => ({ template_signatory_ref: ref, field_type: "signature", page_number: 1, position_x: 1, position_y: 1, width: 1, height: 1 });
const unif = { signatories: [{ ref: "role-client" }, { ref: "80b476d9" }], fields: [fld("role-client"), fld("role-client"), fld("80b476d9")] };
const unif2 = { signatories: [{ ref: "client" }, { ref: "role-client" }, { ref: "80b476d9" }], fields: [fld("role-client"), fld("80b476d9")] };
const proc = { signatories: [{ ref: "client" }], fields: [fld("client")] };
const doc = (id: string, def: any) => { const r = _rts(def, base); if (r.unresolved.length) throw new Error("unresolved " + JSON.stringify(r.unresolved)); return { template_id: id, title: id, frozen_content: {}, signatories: r.resolved, fields: def.fields }; };
const byP = (d: any) => d.fields.map((f: any) => f.participant_ref);

Deno.test("Caso A — Contrato Unificado", () => {
  const o = _bmd([doc("U", unif)]);
  assertEquals(o.documents.length, 1); assertEquals(o.participants.length, 2);
  assertEquals(o.participants[0].email, "joao@x.com"); assertEquals(o.participants[1].email, "kaik@x.com");
  assertEquals(byP(o.documents[0]), ["p1", "p1", "p2"]);
});
Deno.test("Caso B — Procuração + Unificado", () => {
  const o = _bmd([doc("P", proc), doc("U", unif)]);
  assertEquals(o.documents.length, 2); assertEquals(o.participants.length, 2);
  assertEquals(byP(o.documents[0]), ["p1"]); assertEquals(byP(o.documents[1]), ["p1", "p1", "p2"]);
});
Deno.test("Caso C — Unificado 2 ignora client sem field", () => {
  const r = _rts(unif2, base);
  assertEquals(r.unresolved, []); assertEquals(r.resolved.map((x) => x.template_ref), ["role-client", "80b476d9"]);
  const o = _bmd([doc("U2", unif2)]);
  assertEquals(o.participants.length, 2); assertEquals(o.participants[0].identity, "contact:c1"); assertEquals(o.participants[1].identity, "manual:kaik@x.com");
  assertEquals(unif2.signatories.length, 3); // definição intacta
});
Deno.test("Caso D — signatário sem field não aparece", () => {
  const o = _bmd([doc("D", { signatories: [{ ref: "role-client" }, { ref: "orfao" }], fields: [fld("role-client")] })]);
  assertEquals(o.participants.length, 1);
});

const kaikT = { ref: "80b476d9", identity_source: "template", name: "Kaik Rebizzi", email: "krebizzi@x.com.br" };
const cliC = { ref: "role-client", identity_source: "consumer", name: null, email: null };
const noEx = { ...base, extras: {} };
const docT = (id: string, def: any) => { const r = _rts(def, noEx); if (r.unresolved.length) throw new Error("unresolved"); return { template_id: id, title: id, frozen_content: {}, signatories: r.resolved, fields: def.fields }; };
const unifT = { signatories: [cliC, kaikT], fields: [fld("role-client"), fld("80b476d9")] };
Deno.test("Fixo A — Unificado sem input manual", () => {
  const o = _bmd([docT("U", unifT)]);
  assertEquals(o.participants.length, 2); assertEquals(o.participants[1].email, "krebizzi@x.com.br"); assertEquals(o.participants[1].name, "Kaik Rebizzi");
});
Deno.test("Fixo B — Procuração + Unificado", () => {
  const o = _bmd([docT("P", { signatories: [cliC], fields: [fld("role-client")] }), docT("U", unifT)]);
  assertEquals(o.documents.length, 2); assertEquals(o.participants.length, 2);
});
Deno.test("Fixo C — Unificado 2", () => {
  const d = { signatories: [{ ref: "client" }, cliC, kaikT], fields: [fld("role-client"), fld("80b476d9")] };
  const o = _bmd([docT("U2", d)]);
  assertEquals(o.participants.length, 2); assertEquals(o.participants[0].identity, "contact:c1");
});
Deno.test("Fixo D — consumer desconhecido mantém manual", () => {
  const d = { signatories: [cliC, { ref: "x", identity_source: "consumer" }], fields: [fld("role-client"), fld("x")] };
  assertEquals(_rts(d, noEx).unresolved.map((u) => u.ref), ["x"]);
  assertEquals(_rts(d, { ...noEx, extras: { x: { name: "Z", email: "z@x.com" } } }).unresolved, []);
});
Deno.test("Fixo E — sem identity_source igual ao antigo", () => {
  assertEquals(_rts(unif, base).resolved.map((x) => x.identity), ["contact:c1", "manual:kaik@x.com"]);
});
Deno.test("Fixo F — template com e-mail inválido não vira cliente", () => {
  const d = { signatories: [{ ...kaikT, ref: "t", email: "ruim" }], fields: [fld("t")] };
  const r = _rts(d, noEx);
  assertEquals(r.resolved, []); assertEquals(r.unresolved[0].reason, "invalid_template_identity");
});
