// deno test supabase/functions/_shared/inbound-opportunity.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideInboundOpportunity, type InboundOpportunitySettings } from "./inbound-opportunity.ts";

const now = new Date("2026-11-02T12:00:00Z");
const diasAtras = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const decide = (
  settings: InboundOpportunitySettings,
  o: { created?: boolean; open?: boolean; wonAt?: string | null } = {},
) => decideInboundOpportunity({
  settings,
  contactCreated: o.created ?? false,
  hasOpenOpportunity: o.open ?? false,
  lastWonAt: o.wonAt ?? null,
  now,
});

Deno.test("desligado nunca cria", () => {
  assertEquals(decide({ auto_create_opportunity: false }, { created: true }), "disabled");
  assertEquals(decide({}, { created: true }), "disabled");
});

Deno.test("padrão (sem opportunity_trigger) = só contato novo, como antes", () => {
  assertEquals(decide({ auto_create_opportunity: true }, { created: true }), "create");
  assertEquals(decide({ auto_create_opportunity: true }, { created: false }), "existing_contact");
  assertEquals(decide({ auto_create_opportunity: true, opportunity_trigger: "new_contact" }), "existing_contact");
});

Deno.test("sem oportunidade aberta: contato antigo volta e ganha oportunidade", () => {
  const s: InboundOpportunitySettings = { auto_create_opportunity: true, opportunity_trigger: "no_open_opportunity" };
  assertEquals(decide(s), "create");
  assertEquals(decide(s, { created: true }), "create");
  assertEquals(decide(s, { open: true }), "open_opportunity");
  // Sem carência, venda ganha ontem não impede.
  assertEquals(decide(s, { wonAt: diasAtras(1) }), "create");
});

Deno.test("carência depois de venda ganha", () => {
  const s: InboundOpportunitySettings = {
    auto_create_opportunity: true, opportunity_trigger: "no_open_opportunity", reopen_skip_won_days: 30,
  };
  assertEquals(decide(s, { wonAt: diasAtras(10) }), "recent_win");
  assertEquals(decide(s, { wonAt: diasAtras(31) }), "create");
  assertEquals(decide(s, { wonAt: null }), "create");
  assertEquals(decide({ ...s, reopen_skip_won_days: 0 }, { wonAt: diasAtras(1) }), "create");
});
