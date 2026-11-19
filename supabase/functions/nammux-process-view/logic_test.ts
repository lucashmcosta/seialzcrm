import { assertEquals } from "jsr:@std/assert@1";
import { parseViewRequest, viewResponse } from "./logic.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";

Deno.test("pedido: só com os dois ids válidos", () => {
  assertEquals(parseViewRequest({ organizationId: ORG, opportunityId: OPP }), { organizationId: ORG, opportunityId: OPP });
  for (const b of [null, {}, { organizationId: ORG }, { organizationId: "x", opportunityId: OPP }]) assertEquals(parseViewRequest(b), null);
});

Deno.test("resposta: só o processo da oportunidade, no formato da tela", () => {
  const r = viewResponse({
    processes: [
      { seialz_opportunity_id: "outra", agenda: [{ id: "x", type: "audiencia", status: "pendente", start_at: "2026-12-10T13:00:00Z" }] },
      { seialz_opportunity_id: OPP,
        agenda: [{ id: "ev1", type: "audiencia", subtype: "Una", status: "pendente", start_at: "2026-12-10T13:00:00Z", virtual_link: "https://exemplo.invalid/s" }, { type: "audiencia" }],
        timeline: [{ at: "2026-11-18T10:00:00Z", title: "O juiz tomou uma decisão", description: "Foi decidido um ponto.", attention: false }, { title: "sem data" }] },
    ],
  }, OPP);
  assertEquals(r.agenda.length, 1);
  assertEquals(r.agenda[0].external_event_id, "ev1");
  assertEquals(r.agenda[0].event_type, "audiencia");
  assertEquals(r.timeline, [{ at: "2026-11-18T10:00:00Z", title: "O juiz tomou uma decisão", description: "Foi decidido um ponto.", attention: false }]);
  assertEquals(viewResponse(null, OPP), { available: true, agenda: [], timeline: [] });
});
