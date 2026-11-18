import { assertEquals } from "jsr:@std/assert@1";
import { eventEntity } from "./nammux.ts";

Deno.test("entidade do evento vem de aggregate_type / aggregate_id", () => {
  // É o que integration_events guarda de verdade.
  assertEquals(
    eventEntity({ aggregate_type: "opportunity", aggregate_id: "opp-1" }),
    { type: "opportunity", id: "opp-1" },
  );
});

Deno.test("nomes antigos continuam aceitos; sem nenhum, fica indefinido", () => {
  assertEquals(eventEntity({ entity_type: "contact", entity_id: "c-1" }), { type: "contact", id: "c-1" });
  assertEquals(eventEntity({}), { type: undefined, id: undefined });
  assertEquals(eventEntity(null), { type: undefined, id: undefined });
  // aggregate_* vence quando os dois existem
  assertEquals(
    eventEntity({ aggregate_type: "opportunity", aggregate_id: "a", entity_type: "x", entity_id: "b" }),
    { type: "opportunity", id: "a" },
  );
});

Deno.test("send_opportunity_won desliga o negócio ganho, não os outros eventos", async () => {
  const { nammuxSendDisabled } = await import("./nammux.ts");
  // negócio ganho e contato: respeitam os dois interruptores
  assertEquals(nammuxSendDisabled({ enabled: true, send_opportunity_won: false }, true), true);
  assertEquals(nammuxSendDisabled({ enabled: false }, true), true);
  assertEquals(nammuxSendDisabled({}, true), false);
  // entrevista: só `enabled`
  assertEquals(nammuxSendDisabled({ enabled: true, send_opportunity_won: false }, false), false);
  assertEquals(nammuxSendDisabled({ enabled: false, send_opportunity_won: true }, false), true);
});

Deno.test("entrevista tem handler de envio registrado", async () => {
  const { resolve } = await import("./registry.ts");
  const { nammuxSendEventHandler, nammuxSendOpportunityWonHandler } = await import("./nammux.ts");
  assertEquals(resolve("nammux", "send_interview_scheduled"), nammuxSendEventHandler);
  assertEquals(resolve("nammux", "send_opportunity_won"), nammuxSendOpportunityWonHandler);
  assertEquals(resolve("nammux", "send_contact_updated"), nammuxSendOpportunityWonHandler);
});
