import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_HANDOFF_ACK } from "../src/lib/agentDistribution.ts";
import { AGENT_HANDOFF_ACK, agentIdentityLine, agentInputKind, billableInputTokens, currentTimeForPrompt, decideAgentGate, handoffAckText, joinAgentText, splitIntoBubbles, splitPromptForCache, withoutRepeatedLast } from "../supabase/functions/_shared/intelligence/agent-gate.ts";

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
Deno.test("mensagem longa vira até 3 mensagens, sem perder texto", () => {
  assertEquals(splitIntoBubbles("Oi"), ["Oi"]);
  assertEquals(splitIntoBubbles("a\n\nb"), ["a", "b"]);
  assertEquals(splitIntoBubbles("a\nb\n\n\nc"), ["a\nb", "c"]);
  assertEquals(splitIntoBubbles("a\n\nb\n\nc\n\nd"), ["a", "b", "c\n\nd"]);
  assertEquals(splitIntoBubbles(""), []);
});
Deno.test("texto antes da ferramenta não se perde nem repete", () => {
  assertEquals(joinAgentText(["Isso não é golpe."], "Qual seu nome?"), "Isso não é golpe.\n\nQual seu nome?");
  assertEquals(joinAgentText(["Oi"], "Oi"), "Oi");
  assertEquals(joinAgentText([], ""), "");
  assertEquals(joinAgentText(["Obrigada.\n\nVocê recebe?"], "Obrigada.  Você recebe?"), "Obrigada.\n\nVocê recebe?");
  assertEquals(joinAgentText(["Obrigada, Ana."], "Você recebe?"), "Obrigada, Ana.\n\nVocê recebe?");
});
Deno.test("mensagem atual não aparece duas vezes", () => {
  const h = [{ role: "assistant", content: "Oi" }, { role: "user", content: "5 de maio" }];
  assertEquals(withoutRepeatedLast(h, "5 de maio"), h.slice(0, 1));
  assertEquals(withoutRepeatedLast(h, "outra"), h);
});
Deno.test("custo do cache entra no limite mensal", () => {
  assertEquals(billableInputTokens({ input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000 }), 1450);
  assertEquals(billableInputTokens(null), 0);
});
Deno.test("data no fuso certo, e fuso inválido não quebra", () => {
  const t = new Date("2026-11-09T02:30:00Z");
  assertEquals(currentTimeForPrompt("America/Sao_Paulo", t).includes("8 de novembro de 2026"), true);
  assertEquals(currentTimeForPrompt("fuso/errado", t).includes("2026"), true);
});
Deno.test("só a parte fixa vai para o cache", () => {
  assertEquals(splitPromptForCache("fixo\n## CONTEXTO DO CONTATO\nmuda"), ["fixo", "\n## CONTEXTO DO CONTATO\nmuda"]);
  assertEquals(splitPromptForCache("sem marcador"), ["sem marcador", ""]);
});

Deno.test("apresentação: padrão é assistente virtual; pelo nome mantém a verdade quando perguntam", () => {
  assertEquals(agentIdentityLine("Gabi", true), "Você é Gabi, um assistente virtual.");
  assertEquals(agentIdentityLine("Gabi", null), "Você é Gabi, um assistente virtual.");
  const own = agentIdentityLine("Gabi", false);
  assertEquals(own.startsWith("Você é Gabi, da equipe de atendimento."), true);
  assertEquals(own.includes("diga a verdade"), true);
});
