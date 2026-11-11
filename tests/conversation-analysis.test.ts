import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  batchCostUsd,
  buildBatchItem,
  buildConversationSystemPrompt,
  buildConversationUserPrompt,
  buildReportUserPrompt,
  CONVERSATION_SCHEMA,
  type ConversationMessage,
  formatTranscript,
  MAX_TRANSCRIPT_CHARS,
  parseBatchResultLine,
} from "../supabase/functions/_shared/intelligence/conversation-analysis.ts";
import { normalizeProfile } from "../supabase/functions/_shared/intelligence/analysis-profile.ts";

const msg = (p: Partial<ConversationMessage>): ConversationMessage => ({
  sent_at: "2026-10-01T12:00:00Z", direction: "inbound", sender_user_id: null, sender_agent_id: null,
  sender_type: "contact", media_type: null, is_template: false, content: "oi", transcript: null, ...p,
});

Deno.test("conversa sai em ordem, com quem falou e hora de Brasília", () => {
  const { text, stats } = formatTranscript([
    msg({ content: "Fui mandado embora" }),
    msg({ sent_at: "2026-10-01T12:05:00Z", direction: "outbound", sender_user_id: "u1", sender_type: "user", content: "Quando entrou?" }),
    msg({ sent_at: "2026-10-01T12:06:00Z", direction: "outbound", sender_agent_id: "a1", sender_type: "agent", content: "Sou a assistente" }),
    msg({ sent_at: "2026-10-01T12:07:00Z", direction: "outbound", sender_type: "user", is_template: true, content: "Lembrete" }),
  ], { u1: "Ana" });
  assertEquals(text.split("\n"), [
    "[01/10 09:00] Cliente: Fui mandado embora",
    "[01/10 09:05] Equipe (Ana): Quando entrou?",
    "[01/10 09:06] Agente de IA: Sou a assistente",
    "[01/10 09:07] Automação (modelo pronto): Lembrete",
  ]);
  assertEquals(stats.message_count, 4);
  assertEquals(stats.lead_message_count, 1);
  assertEquals(stats.team_message_count, 1);
});

Deno.test("áudio entra pela transcrição e silêncio longo fica marcado", () => {
  const { text, stats } = formatTranscript([
    msg({ media_type: "audio", content: "[Áudio]", transcript: "trabalhei dois anos" }),
    msg({ sent_at: "2026-10-04T12:00:00Z", media_type: "audio", content: "[Áudio]" }),
    msg({ sent_at: "2026-10-04T12:01:00Z", media_type: "document", content: "carteira.pdf" }),
  ], {});
  const lines = text.split("\n");
  assertEquals(lines[0], "[01/10 09:00] Cliente: [áudio] trabalhei dois anos");
  assertEquals(lines[1], "--- 3 dias sem mensagens ---");
  assertEquals(lines[2], "[04/10 09:00] Cliente: [áudio sem transcrição]");
  assertEquals(lines[3], "[04/10 09:01] Cliente: [documento] carteira.pdf");
  assertEquals(stats.audio_count, 2);
});

Deno.test("conversa enorme guarda o começo e o fim", () => {
  const many = Array.from({ length: 3000 }, (_, i) =>
    msg({ sent_at: new Date(Date.UTC(2026, 9, 1, 12, 0, i)).toISOString(), content: `mensagem ${i} ${"x".repeat(60)}` }));
  const { text } = formatTranscript(many, {});
  assert(text.length <= MAX_TRANSCRIPT_CHARS + 60);
  assertStringIncludes(text, "mensagem 0 ");
  assertStringIncludes(text, "mensagem 2999 ");
  assertStringIncludes(text, "trecho do meio omitido");
});

Deno.test("pedido em lote usa esquema de saída, sem ferramenta forçada nem temperatura", () => {
  const item = buildBatchItem({
    customId: "opp-1", model: "claude-opus-5-5", system: "s", user: "u", schema: CONVERSATION_SCHEMA, effort: "medium", maxTokens: 16000,
  });
  assertEquals(item.custom_id, "opp-1");
  const params = item.params as any;
  assertEquals(params.output_config.format.type, "json_schema");
  assertEquals(params.output_config.effort, "medium");
  assertEquals("tool_choice" in params, false);
  assertEquals("temperature" in params, false);
  assertEquals("thinking" in params, false);
});

Deno.test("esquema: todo objeto fecha propriedades e exige todas", () => {
  const walk = (node: any) => {
    if (node?.type === "object") {
      assertEquals(node.additionalProperties, false);
      assertEquals(node.required.sort(), Object.keys(node.properties).sort());
      Object.values(node.properties).forEach(walk);
    }
    if (node?.type === "array") walk(node.items);
  };
  walk(CONVERSATION_SCHEMA);
});

Deno.test("resultado do lote: sucesso, recusa, corte e erro", () => {
  const ok = parseBatchResultLine({
    custom_id: "a", result: { type: "succeeded", message: {
      stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 },
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"summary":"x"}' }],
    } },
  });
  assertEquals(ok, { customId: "a", ok: true, data: { summary: "x" }, promptTokens: 100, completionTokens: 50 });

  const refusal = parseBatchResultLine({ custom_id: "b", result: { type: "succeeded", message: { stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 1 }, content: [] } } });
  assertEquals(refusal.ok, false);
  assertEquals((refusal as any).error, "refusal");
  assertEquals(refusal.promptTokens, 10);

  const cut = parseBatchResultLine({ custom_id: "c", result: { type: "succeeded", message: { stop_reason: "max_tokens", content: [{ type: "text", text: '{"su' }] } } });
  assertEquals((cut as any).error, "max_tokens");

  const errored = parseBatchResultLine({ custom_id: "d", result: { type: "errored", error: { type: "error", error: { type: "invalid_request_error" } } } });
  assertEquals((errored as any).error, "errored:invalid_request_error");
  assertEquals(parseBatchResultLine({ custom_id: "e", result: { type: "expired" } }).ok, false);
});

Deno.test("custo do lote é metade do preço normal", () => {
  // Opus 5.5: US$ 4 e US$ 20 por milhão -> 1M de entrada + 100k de saída = 4 + 2 = 6, no lote 3.
  assertEquals(batchCostUsd({ input_per_1k_usd: 0.004, output_per_1k_usd: 0.02 }, 1_000_000, 100_000), 3);
});

Deno.test("prompt é genérico e usa o perfil da org", () => {
  const geral = buildConversationSystemPrompt(normalizeProfile({ business_description: "Vendemos plano de saúde para pets." }));
  assertStringIncludes(geral, "Vendemos plano de saúde para pets.");
  assertEquals(geral.includes("advocacia"), false);
  assertStringIncludes(buildConversationSystemPrompt(normalizeProfile({ preset: "juridico" })), "advocacia");
});

Deno.test("cabeçalho da conversa traz resultado, responsável e dias", () => {
  const user = buildConversationUserPrompt({
    opportunity_id: "x", outcome: "lost", owner_name: "Ana", stage_before_close: "Em Contato",
    opened_at: "2026-10-01T00:00:00Z", closed_at: "2026-10-08T12:00:00Z",
  }, "[01/10 09:00] Cliente: oi");
  assertStringIncludes(user, "Resultado: PERDIDA");
  assertStringIncludes(user, "Responsável: Ana");
  assertStringIncludes(user, "Dias entre abrir e fechar: 7.5");
});

Deno.test("relatório recebe uma linha por conversa com código curto", () => {
  const text = buildReportUserPrompt([
    { opportunity_id: "12345678-aaaa", outcome: "won", owner_name: "Ana", stage_before_close: null, days_to_close: 0.81, message_count: 80, analysis: { summary: "ok" } },
    { opportunity_id: "87654321-bbbb", outcome: "lost", owner_name: null, stage_before_close: "Novo", days_to_close: 8, message_count: 10, analysis: { summary: "sumiu" } },
  ]);
  const lines = text.split("\n");
  assertEquals(lines[0], "2 conversas analisadas: 1 ganhas e 1 perdidas. Uma por linha:");
  assertEquals(JSON.parse(lines[1]).codigo, "12345678");
  assertEquals(JSON.parse(lines[1]).dias_ate_fechar, 0.8);
  assertEquals(JSON.parse(lines[2]).responsavel, "sem responsável");
});
