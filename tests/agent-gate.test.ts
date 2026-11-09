import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_HANDOFF_ACK } from "../src/lib/agentDistribution.ts";
import { AGENT_HANDOFF_ACK, agentInputKind, decideAgentGate, handoffAckText } from "../supabase/functions/_shared/intelligence/agent-gate.ts";

const mine = { ai_agent_id: "a1", ai_agent_released_at: null, needs_human_attention: false, assigned_user_id: null };

Deno.test("conversa do agente, sem humano, ele responde", () => assertEquals(decideAgentGate(mine, "a1", false), "respond"));
Deno.test("conversa de antes ou de outro destino fica com humano", () => {
  assertEquals(decideAgentGate({ ...mine, ai_agent_id: null }, "a1", false), "human_owns");
  assertEquals(decideAgentGate({ ...mine, ai_agent_id: "a2" }, "a1", false), "human_owns");
  assertEquals(decideAgentGate(null, "a1", false), "human_owns");
});
Deno.test("depois da passagem ele nunca responde de novo", () => {
  assertEquals(decideAgentGate({ ...mine, ai_agent_released_at: "2026-11-09" }, "a1", false), "human_owns");
});
Deno.test("vendedor que entrou na conversa assume", () => {
  assertEquals(decideAgentGate(mine, "a1", true), "take_over");
  assertEquals(decideAgentGate({ ...mine, assigned_user_id: "u1" }, "a1", false), "take_over");
  assertEquals(decideAgentGate({ ...mine, needs_human_attention: true }, "a1", false), "take_over");
});
Deno.test("só áudio é escutado; outra mídia vai para humano", () => {
  assertEquals(agentInputKind(null), "text");
  assertEquals(agentInputKind("audio"), "audio");
  assertEquals(agentInputKind("audio/ogg"), "audio");
  for (const m of ["image", "document", "video", "sticker"]) assertEquals(agentInputKind(m), "unsupported_media");
});
Deno.test("aviso da passagem é configurável e pode não existir", () => {
  assertEquals(DEFAULT_HANDOFF_ACK, AGENT_HANDOFF_ACK);
  assertEquals(handoffAckText(null), AGENT_HANDOFF_ACK);
  assertEquals(handoffAckText(undefined), AGENT_HANDOFF_ACK);
  assertEquals(handoffAckText("Vou revisar aqui e já te falo"), "Vou revisar aqui e já te falo");
  assertEquals(handoffAckText(""), null);
  assertEquals(handoffAckText("   "), null);
});
