import { assert, assertEquals } from "jsr:@std/assert@1";
import { accountStateFromUpdate, isLockFailure, sendBlockFromStatus, sendBlockTransition } from "../supabase/functions/_shared/meta-whatsapp/send-block.ts";
import { describeAccountEvent } from "../supabase/functions/_shared/meta-whatsapp/account-events.ts";

const failed = (code: number) => ({ status: "failed", errors: [{ code, title: "Business Account locked" }] });
const sentAt = (iso: string) => ({ status: "sent", timestamp: String(Math.floor(Date.parse(iso) / 1000)) });

Deno.test("conta bloqueada (131031 e 368) marca o bloqueio; outros erros não", () => {
  assert(isLockFailure(failed(131031)));
  assert(isLockFailure(failed(368)));
  assertEquals(isLockFailure(failed(131049)), false);
  assertEquals(sendBlockTransition(failed(131031), null), "block");
  assertEquals(sendBlockTransition(failed(131047), null), null);
});

Deno.test("já bloqueado: nova falha não marca de novo", () => {
  assertEquals(sendBlockTransition(failed(131031), { since: "2026-11-22T20:29:42Z" }), null);
});

Deno.test("libera só com 'sent' de mensagem enviada depois do bloqueio", () => {
  const block = { since: "2026-11-22T20:29:42Z" };
  assertEquals(sendBlockTransition(sentAt("2026-11-23T10:00:00Z"), block), "unblock");
  assertEquals(sendBlockTransition(sentAt("2026-11-22T20:00:00Z"), block), null);
  // leitura ou entrega de mensagem antiga depois do bloqueio não libera
  assertEquals(sendBlockTransition({ status: "read", timestamp: String(Math.floor(Date.parse("2026-11-23T10:00:00Z") / 1000)) }, block), null);
  assertEquals(sendBlockTransition({ status: "delivered", timestamp: "9999999999" }, block), null);
  assertEquals(sendBlockTransition(sentAt("2026-11-23T10:00:00Z"), null), null);
});

Deno.test("bloqueio guarda o código e o título do erro da Meta", () => {
  const b = sendBlockFromStatus(failed(131031), new Date("2026-11-22T20:29:42Z"));
  assertEquals(b, { since: "2026-11-22T20:29:42.000Z", error_code: 131031, error_title: "Business Account locked" });
});

Deno.test("ACCOUNT_RESTRICTION guarda tipos e a maior data como previsão", () => {
  const r = accountStateFromUpdate({
    event: "ACCOUNT_RESTRICTION",
    restriction_info: [
      { restriction_type: "RESTRICTED_BIZ_INITIATED_MESSAGING", expiration: 1766435340 },
      { restriction_type: "RESTRICTED_CUSTOMER_INITIATED_MESSAGING", expiration: 1766435400 },
    ],
  }, new Date("2026-11-22T20:30:00Z"));
  assert(r && r.kind === "restriction");
  if (r?.kind === "restriction") {
    assertEquals(r.restriction.types, ["RESTRICTED_BIZ_INITIATED_MESSAGING", "RESTRICTED_CUSTOMER_INITIATED_MESSAGING"]);
    assertEquals(r.restriction.expires_at, new Date(1766435400 * 1000).toISOString());
    assertEquals(r.restriction.state, "RESTRICTED");
  }
});

Deno.test("DISABLED_UPDATE: DISABLE grava restrição; REINSTATE limpa; outros eventos não mexem", () => {
  assertEquals(accountStateFromUpdate({ event: "DISABLED_UPDATE", ban_info: { waba_ban_state: "DISABLE" } })?.kind, "restriction");
  assertEquals(accountStateFromUpdate({ event: "DISABLED_UPDATE", ban_info: { waba_ban_state: "REINSTATE" } }), { kind: "reinstate" });
  assertEquals(accountStateFromUpdate({ event: "VERIFIED_ACCOUNT" }), null);
});

Deno.test("conta reativada vira boa notícia, não alerta", () => {
  const s = describeAccountEvent("account_update", { event: "DISABLED_UPDATE", ban_info: { waba_ban_state: "REINSTATE" } });
  assertEquals(s.critical, false);
  assertEquals(s.good_news, true);
  assert(describeAccountEvent("account_update", { event: "DISABLED_UPDATE", ban_info: { waba_ban_state: "DISABLE" } }).critical);
});
