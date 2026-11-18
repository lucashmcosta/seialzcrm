import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildMessagingCustomData, buildMessagingUserData, MESSAGING_EVENTS, pickRule, singleValue } from "./messaging.ts";

const base = { em: ["e"], ph: ["p"], fn: ["f"], external_id: ["x"], fbc: "fb.1.1.a", lead_id: "1", client_ip_address: "1.1.1.1" };

Deno.test("com ctwa_clid: leva WABA + clid + page_id, sem external_id/fbc/lead_id/IP", () => {
  const r = buildMessagingUserData(base, { wabaId: "W", ctwaClid: "C", pageId: "P" });
  if (!r.ok) throw new Error("esperava ok");
  assertEquals(r.matchedBy, "ctwa_clid");
  assertEquals(r.userData, { em: ["e"], ph: ["p"], fn: ["f"], whatsapp_business_account_id: "W", page_id: "P", ctwa_clid: "C" });
});

Deno.test("sem ctwa_clid: exige page_id e leva dados com hash", () => {
  const r = buildMessagingUserData(base, { wabaId: "W", ctwaClid: null, pageId: "P" });
  if (!r.ok) throw new Error("esperava ok");
  assertEquals(r.matchedBy, "page_id");
  assertEquals(r.userData.page_id, "P");
  assertEquals("ctwa_clid" in r.userData, false);
});

Deno.test("sem ctwa_clid e sem page_id: não envia", () => {
  assertEquals(buildMessagingUserData(base, { wabaId: "W", ctwaClid: null, pageId: null }), { ok: false, reason: "missing_page_id" });
});

Deno.test("sem ctwa_clid e sem em/ph: não envia", () => {
  assertEquals(buildMessagingUserData({ fn: ["f"] }, { wabaId: "W", ctwaClid: null, pageId: "P" }), { ok: false, reason: "missing_customer_data" });
});

Deno.test("sem WABA: não envia", () => {
  assertEquals(buildMessagingUserData(base, { wabaId: null, ctwaClid: "C", pageId: "P" }), { ok: false, reason: "missing_waba" });
});

Deno.test("Lead não é evento de mensagens; LeadSubmitted e Purchase são", () => {
  assertEquals(MESSAGING_EVENTS.has("Lead"), false);
  assertEquals(MESSAGING_EVENTS.has("LeadSubmitted"), true);
  assertEquals(MESSAGING_EVENTS.has("Purchase"), true);
});

Deno.test("custom_data: fixo, valor da oportunidade, nenhum", () => {
  const fixed = { trigger_type: "won" as const, event_name: "Purchase", value_mode: "fixed" as const, fixed_value: "1945.20", currency: "BRL" };
  assertEquals(buildMessagingCustomData(fixed, 0), { currency: "BRL", value: 1945.2 });
  assertEquals(buildMessagingCustomData({ ...fixed, value_mode: "amount" }, 300), { currency: "BRL", value: 300 });
  assertEquals(buildMessagingCustomData({ ...fixed, value_mode: "amount" }, null), { currency: "BRL", value: 0 });
  assertEquals(buildMessagingCustomData({ ...fixed, value_mode: "none" }, 300), null);
  assertEquals(buildMessagingCustomData(null, 300), null);
});

Deno.test("pickRule prefere 'won' no ganho", () => {
  const rules = [
    { trigger_type: "stage_entered" as const, event_name: "Purchase", value_mode: "none" as const, fixed_value: null, currency: "BRL" },
    { trigger_type: "won" as const, event_name: "Purchase", value_mode: "fixed" as const, fixed_value: 10, currency: "BRL" },
  ];
  assertEquals(pickRule(rules, "Purchase", true)?.trigger_type, "won");
  assertEquals(pickRule(rules, "Purchase", false)?.trigger_type, "stage_entered");
  assertEquals(pickRule(rules, "LeadSubmitted", false), null);
});

Deno.test("singleValue", () => {
  assertEquals(singleValue(["a", "a", null]), "a");
  assertEquals(singleValue(["a", "b"]), null);
  assertEquals(singleValue([]), null);
});
