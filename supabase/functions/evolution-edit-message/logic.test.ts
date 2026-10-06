import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acceptedEdit, checkEditable, EDIT_WINDOW_MS, type MsgRow, resolveEditKey } from "./logic.ts";

const NOW = Date.parse("2026-10-06T20:00:00Z");
const ME = "u-1";
const SID = "3EB0A08785800FFB12F5BA";

function base(over: Partial<MsgRow> = {}): MsgRow {
  return {
    id: "m1", organization_id: "o1", thread_id: "t1", sender_user_id: ME, sender_type: "user",
    direction: "outbound", content: "antigo", sent_at: new Date(NOW - 60_000).toISOString(),
    deleted_at: null, is_internal_note: false, template_id: null, media_urls: null, media_type: null,
    error_code: null, whatsapp_status: "delivered", whatsapp_message_sid: SID, endpoint_id: "e1", edit_count: 0,
    metadata: { evolution: { to: "5511964298621", wamid: SID, endpoint_id: "e1", instance_name: "evo-x",
      response: { key: { id: SID, fromMe: true, remoteJid: "5511964298621@s.whatsapp.net" } } } },
    ...over,
  };
}

Deno.test("ok", () => assertEquals(checkEditable(base(), ME, "novo", NOW), null));
Deno.test("não autor", () => assertEquals(checkEditable(base(), "outro", "novo", NOW), "not_author"));
Deno.test("agente não edita", () => assertEquals(checkEditable(base({ sender_type: "agent" }), ME, "novo", NOW), "not_author"));
Deno.test("inbound", () => assertEquals(checkEditable(base({ direction: "inbound" }), ME, "n", NOW), "not_editable"));
Deno.test("mídia", () => assertEquals(checkEditable(base({ media_urls: ["x"] }), ME, "n", NOW), "not_editable"));
Deno.test("template", () => assertEquals(checkEditable(base({ template_id: "t" }), ME, "n", NOW), "not_editable"));
Deno.test("nota interna", () => assertEquals(checkEditable(base({ is_internal_note: true }), ME, "n", NOW), "not_editable"));
Deno.test("falha", () => assertEquals(checkEditable(base({ whatsapp_status: "failed" }), ME, "n", NOW), "not_editable"));
Deno.test("apagada", () => assertEquals(checkEditable(base({ deleted_at: "x" }), ME, "n", NOW), "not_editable"));
Deno.test("sem sid", () => assertEquals(checkEditable(base({ whatsapp_message_sid: null }), ME, "n", NOW), "not_editable"));
Deno.test("15m00 ok", () =>
  assertEquals(checkEditable(base({ sent_at: new Date(NOW - EDIT_WINDOW_MS).toISOString() }), ME, "n", NOW), null));
Deno.test("15m01 expira", () =>
  assertEquals(checkEditable(base({ sent_at: new Date(NOW - EDIT_WINDOW_MS - 1000).toISOString() }), ME, "n", NOW), "edit_window_expired"));
Deno.test("texto igual", () => assertEquals(checkEditable(base(), ME, "antigo", NOW), "content_unchanged"));

Deno.test("remoteJid ok", () => assertEquals(resolveEditKey(base())?.number, "5511964298621"));
Deno.test("remoteJid ausente", () => assertEquals(resolveEditKey(base({ metadata: { evolution: { to: "5511964298621" } } })), null));
Deno.test("remoteJid @lid", () => {
  const m = base(); m.metadata.evolution.response.key.remoteJid = "17154216874069@lid";
  assertEquals(resolveEditKey(m), null);
});
Deno.test("remoteJid diverge do to", () => {
  const m = base(); m.metadata.evolution.to = "5511999999999";
  assertEquals(resolveEditKey(m), null);
});
Deno.test("key.id diverge do sid", () => {
  const m = base(); m.metadata.evolution.response.key.id = "OUTRO";
  assertEquals(resolveEditKey(m), null);
});
Deno.test("fromMe false", () => {
  const m = base(); m.metadata.evolution.response.key.fromMe = false;
  assertEquals(resolveEditKey(m), null);
});
Deno.test("endpoint diverge", () => {
  const m = base(); m.metadata.evolution.endpoint_id = "e2";
  assertEquals(resolveEditKey(m), null);
});

Deno.test("resposta aceita (formato real Fase 0)", () => {
  const r = { key: { id: "3EB0E9F4D68EDBB3C8865A" }, message: { protocolMessage: { key: { id: SID }, type: "MESSAGE_EDIT" } }, status: "PENDING" };
  assertEquals(acceptedEdit(r, SID)?.editKeyId, "3EB0E9F4D68EDBB3C8865A");
});
Deno.test("resposta sem MESSAGE_EDIT", () => assertEquals(acceptedEdit({ key: { id: "x" }, status: "PENDING" }, SID), null));
Deno.test("resposta referenciando outro id", () =>
  assertEquals(acceptedEdit({ message: { protocolMessage: { key: { id: "x" }, type: "MESSAGE_EDIT" } } }, SID), null));
