// Pedido e resposta da análise por mensagem, nos dois provedores aceitos. A análise sempre
// volta pela ferramenta record_message_analysis.
const TOOL_NAME = "record_message_analysis";

export function buildAnalysisRequest(
  target: { provider: string; apiKey: string; model: string },
  system: string,
  user: string,
  tool: { function: { name: string; description?: string; parameters: unknown } },
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  if (target.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": target.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: {
        model: target.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
        tools: [{ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters }],
        tool_choice: { type: "tool", name: TOOL_NAME },
      },
    };
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
    body: {
      model: target.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "function", function: { name: TOOL_NAME } },
    },
  };
}

export type ParsedAnalysis =
  | { ok: true; analysis: unknown; raw: any; promptTokens: number; completionTokens: number; totalTokens: number }
  | { ok: false; error: "no_tool_call" | "invalid_analysis_json" };

export function parseAnalysisResponse(provider: string, data: any): ParsedAnalysis {
  if (provider === "anthropic") {
    const block = (data?.content ?? []).find((b: any) => b?.type === "tool_use");
    if (!block?.input) return { ok: false, error: "no_tool_call" };
    const promptTokens = Number(data?.usage?.input_tokens ?? 0);
    const completionTokens = Number(data?.usage?.output_tokens ?? 0);
    return { ok: true, analysis: block.input, raw: data, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  }
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return { ok: false, error: "no_tool_call" };
  let analysis: unknown;
  try { analysis = JSON.parse(args); } catch { return { ok: false, error: "invalid_analysis_json" }; }
  const promptTokens = Number(data?.usage?.prompt_tokens ?? 0);
  const completionTokens = Number(data?.usage?.completion_tokens ?? 0);
  return { ok: true, analysis, raw: data, promptTokens, completionTokens, totalTokens: Number(data?.usage?.total_tokens ?? promptTokens + completionTokens) };
}
