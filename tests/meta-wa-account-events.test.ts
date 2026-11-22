import { assert, assertEquals } from "jsr:@std/assert@1";
import { accountEventWabaIds, describeAccountEvent } from "../supabase/functions/_shared/meta-whatsapp/account-events.ts";

Deno.test("evento de conta (sem phone_number_id) devolve a WABA", () => {
  const payload = { entry: [{ id: "2901174783601648", changes: [{ field: "account_update", value: { event: "ACCOUNT_RESTRICTION" } }] }] };
  assertEquals(accountEventWabaIds(payload), ["2901174783601648"]);
});

Deno.test("mensagem e status (com phone_number_id) não contam como evento de conta", () => {
  const payload = { entry: [{ id: "123", changes: [{ field: "messages", value: { metadata: { phone_number_id: "999" }, messages: [] } }] }] };
  assertEquals(accountEventWabaIds(payload), []);
});

Deno.test("entry.id que não é só dígito é ignorado (vai para filtro de banco)", () => {
  const payload = { entry: [{ id: "1,2)", changes: [{ field: "account_update", value: {} }] }] };
  assertEquals(accountEventWabaIds(payload), []);
  assertEquals(accountEventWabaIds(null), []);
});

Deno.test("restrição e violação da conta são críticas e trazem o motivo", () => {
  const r = describeAccountEvent("account_update", {
    event: "ACCOUNT_RESTRICTION",
    restriction_info: [{ restriction_type: "RESTRICTED_BIZ_INITIATED_MESSAGING", expiration: 1766435340 }],
  });
  assert(r.critical);
  assert(r.body.includes("RESTRICTED_BIZ_INITIATED_MESSAGING"));
  const v = describeAccountEvent("account_update", { event: "ACCOUNT_VIOLATION", violation_info: { violation_type: "SPAM" } });
  assert(v.critical);
  assert(v.body.includes("SPAM"));
});

Deno.test("atualização comum da conta não gera aviso", () => {
  assertEquals(describeAccountEvent("account_update", { event: "VERIFIED_ACCOUNT" }).critical, false);
});

Deno.test("queda de qualidade do número é crítica; subida não", () => {
  assert(describeAccountEvent("phone_number_quality_update", { event: "FLAGGED", display_phone_number: "5511955074839" }).critical);
  assert(describeAccountEvent("phone_number_quality_update", { event: "DOWNGRADE" }).critical);
  assertEquals(describeAccountEvent("phone_number_quality_update", { event: "UPGRADE" }).critical, false);
});

Deno.test("template amarelo/vermelho ou pausado é crítico", () => {
  assert(describeAccountEvent("message_template_quality_update", { new_quality_score: "RED", message_template_name: "inicio_valor" }).critical);
  assertEquals(describeAccountEvent("message_template_quality_update", { new_quality_score: "GREEN" }).critical, false);
  assert(describeAccountEvent("message_template_status_update", { event: "PAUSED", reason: "LOW_QUALITY" }).critical);
  assertEquals(describeAccountEvent("message_template_status_update", { event: "APPROVED", reason: "NONE" }).critical, false);
});

Deno.test("campo desconhecido é só registrado", () => {
  assertEquals(describeAccountEvent("template_category_update", {}).critical, false);
});
