import { assertEquals } from "jsr:@std/assert@1";
import { endConversationWithLoss, markLostByAgent, markLostEnabled } from "./agent-loss.ts";
import type { LossOptions } from "../loss-suggestion.ts";

const options: LossOptions = {
  reasons: [{ id: "r1", code: "A", name: "Desistiu", details: [{ id: "d1", code: "A1", name: "Não quer mais" }] }],
};
const baseDef = {
  type: "function",
  function: { name: "end_conversation", description: "Encerra.", parameters: { type: "object", properties: { reason: { type: "string" } } } },
};

function fakeDb(opp: { id: string } | null, rpcError: string | null = null) {
  const calls: any[] = [];
  const chain: any = {
    select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: opp }),
  };
  return {
    calls,
    from: () => chain,
    rpc: async (fn: string, args: any) => { calls.push({ fn, args }); return { error: rpcError ? { message: rpcError } : null }; },
  };
}

Deno.test("só liga com mark_lost true", () => {
  assertEquals(markLostEnabled({ end_conversation: { mark_lost: true } }), true);
  assertEquals(markLostEnabled({ end_conversation: {} }), false);
  assertEquals(markLostEnabled(null), false);
});

Deno.test("sem cadastro a ferramenta fica igual; com cadastro ganha loss_code", () => {
  assertEquals(endConversationWithLoss(baseDef, null), baseDef);
  const def = endConversationWithLoss(baseDef, options);
  assertEquals(def.function.parameters.properties.loss_code.enum, ["A1"]);
  assertEquals(def.function.parameters.properties.reason, { type: "string" });
});

Deno.test("perde a oportunidade aberta como agente", async () => {
  const db = fakeDb({ id: "op1" });
  const r = await markLostByAgent(db, { organizationId: "org", contactId: "c1", agentId: "ag", code: "a1", reason: "não quer", options });
  assertEquals(r.lost, true);
  assertEquals(db.calls[0].args._opportunity_id, "op1");
  assertEquals(db.calls[0].args._detail_id, "d1");
  assertEquals(db.calls[0].args._actor_type, "agent");
  assertEquals(db.calls[0].args._automation_ref, "agent:ag");
});

Deno.test("código inválido, sem oportunidade ou erro do banco: não perde e não lança", async () => {
  assertEquals((await markLostByAgent(fakeDb({ id: "op1" }), { organizationId: "o", contactId: "c", code: "Z9", options })).lost, false);
  assertEquals((await markLostByAgent(fakeDb(null), { organizationId: "o", contactId: "c", code: "A1", options })).lost, false);
  assertEquals((await markLostByAgent(fakeDb({ id: "op1" }, "loss_detail_required"), { organizationId: "o", contactId: "c", code: "A1", options })).lost, false);
});
