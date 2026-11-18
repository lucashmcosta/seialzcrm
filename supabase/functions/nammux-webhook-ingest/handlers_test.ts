import { assertEquals } from "jsr:@std/assert@1";
import { isSupportedEvent, LEGACY_EVENT_TYPES, responseForApply, rpcForEvent } from "./handlers.ts";

Deno.test("os quatro tipos antigos continuam aceitos e sem RPC", () => {
  for (const tipo of LEGACY_EVENT_TYPES) {
    assertEquals(isSupportedEvent(tipo), true);
    assertEquals(rpcForEvent(tipo), null);
  }
  assertEquals(LEGACY_EVENT_TYPES.length, 4);
});

Deno.test("agenda é aplicada pela RPC; tipo desconhecido é recusado", () => {
  assertEquals(rpcForEvent("process.agenda.changed"), "nammux_apply_process_event");
  assertEquals(isSupportedEvent("process.agenda.changed"), true);
  assertEquals(isSupportedEvent("process.desconhecido"), false);
  assertEquals(isSupportedEvent(""), false);
  // nome de propriedade herdada não vira tipo aceito
  assertEquals(rpcForEvent("toString"), null);
  assertEquals(isSupportedEvent("constructor"), false);
});

Deno.test("resposta HTTP: 200 encerra, 409 é recusa definitiva, 500 pede reenvio", () => {
  assertEquals(responseForApply({ status: "applied", id: "x" }), { status: 200, body: { ok: true } });
  assertEquals(responseForApply({ status: "duplicate" }), { status: 200, body: { ok: true, duplicate: true } });
  assertEquals(responseForApply({ status: "stale" }), { status: 200, body: { ok: true, ignored_as_stale: true } });
  assertEquals(responseForApply({ status: "opportunity_not_found" }), { status: 409, body: { error: "opportunity_not_found" } });
  assertEquals(responseForApply({ status: "invalid", error: "change_invalid" }), { status: 409, body: { error: "change_invalid" } });
  assertEquals(responseForApply({ status: "invalid" }), { status: 409, body: { error: "invalid_payload" } });
  // O que não reconhecemos não pode ser tratado como entregue.
  assertEquals(responseForApply(null).status, 500);
  assertEquals(responseForApply({}).status, 500);
  assertEquals(responseForApply({ status: "qualquer" }).status, 500);
});

Deno.test("financeiro é aplicado pela RPC própria", () => {
  assertEquals(rpcForEvent("process.finance.changed"), "nammux_apply_process_finance");
  assertEquals(isSupportedEvent("process.finance.changed"), true);
  // transições vêm no resultado, mas a resposta HTTP não muda
  assertEquals(
    responseForApply({ status: "applied", transitions: ["installment_paid"] }),
    { status: 200, body: { ok: true } },
  );
});

Deno.test("movimentação é aplicada pela RPC própria", () => {
  assertEquals(rpcForEvent("process.movement.added"), "nammux_apply_process_movement");
  assertEquals(isSupportedEvent("process.movement.added"), true);
});
