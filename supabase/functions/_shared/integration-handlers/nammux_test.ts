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
