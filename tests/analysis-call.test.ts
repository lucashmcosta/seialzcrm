import { assertEquals } from "jsr:@std/assert@1";
import { buildAnalysisRequest, parseAnalysisResponse } from "../supabase/functions/_shared/intelligence/analysis-call.ts";

const tool = { type: "function", function: { name: "record_message_analysis", description: "d", parameters: { type: "object" } } };

Deno.test("Claude recebe a ferramenta no formato dele e obrigatória", () => {
  const r = buildAnalysisRequest({ provider: "anthropic", apiKey: "k", model: "claude-haiku-5-5" }, "s", "u", tool);
  assertEquals(r.url, "https://api.anthropic.com/v1/messages");
  assertEquals((r.body as any).tools, [{ name: "record_message_analysis", description: "d", input_schema: { type: "object" } }]);
  assertEquals((r.body as any).tool_choice, { type: "tool", name: "record_message_analysis" });
});
Deno.test("OpenAI continua com o mesmo pedido de antes", () => {
  const r = buildAnalysisRequest({ provider: "openai", apiKey: "k", model: "gpt-4o-mini" }, "s", "u", tool);
  assertEquals(r.url, "https://api.openai.com/v1/chat/completions");
  assertEquals((r.body as any).tool_choice, { type: "function", function: { name: "record_message_analysis" } });
});
Deno.test("nenhum provedor aponta para outro endereço", () => {
  const r = buildAnalysisRequest({ provider: "gemini", apiKey: "k", model: "x" }, "s", "u", tool);
  assertEquals(r.url, "https://api.openai.com/v1/chat/completions");
});
Deno.test("as respostas dos dois provedores viram a mesma análise", () => {
  const a = parseAnalysisResponse("anthropic", { content: [{ type: "tool_use", input: { sentiment: "x" } }], usage: { input_tokens: 2, output_tokens: 3 } });
  const b = parseAnalysisResponse("openai", { choices: [{ message: { tool_calls: [{ function: { arguments: '{"sentiment":"x"}' } }] } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } });
  if (!a.ok || !b.ok) throw new Error("falhou");
  assertEquals([a.analysis, a.totalTokens], [b.analysis, b.totalTokens]);
});
Deno.test("resposta sem ferramenta ou com JSON quebrado é recusada", () => {
  assertEquals(parseAnalysisResponse("anthropic", { content: [{ type: "text", text: "x" }] }), { ok: false, error: "no_tool_call" });
  assertEquals(parseAnalysisResponse("openai", { choices: [{ message: { tool_calls: [{ function: { arguments: "{" } }] } }] }), { ok: false, error: "invalid_analysis_json" });
});
