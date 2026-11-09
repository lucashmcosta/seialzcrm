import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { buildChatRequest, callChatTarget, OrgAiError, parseChatResponse } from "../supabase/functions/_shared/intelligence/org-ai.ts";

const claude = { provider: "anthropic" as const, apiKey: "k", model: "claude-sonnet-5-5" };
const gpt = { provider: "openai" as const, apiKey: "k", model: "gpt-4o-mini" };
const msgs = [{ role: "system", content: "regras" }, { role: "user", content: "oi" }];

Deno.test("Claude recebe o sistema fora das mensagens e sem temperatura", () => {
  const r = buildChatRequest(claude, msgs, 100);
  assertEquals(r.url, "https://api.anthropic.com/v1/messages");
  assertEquals(r.body, { model: "claude-sonnet-5-5", max_tokens: 100, system: "regras", messages: [{ role: "user", content: "oi" }] });
});
Deno.test("OpenAI mantém as mensagens e usa max_completion_tokens", () => {
  const r = buildChatRequest(gpt, msgs, 100);
  assertEquals(r.url, "https://api.openai.com/v1/chat/completions");
  assertEquals(r.body, { model: "gpt-4o-mini", max_completion_tokens: 100, messages: msgs });
});
Deno.test("as duas respostas viram o mesmo formato", () => {
  assertEquals(parseChatResponse("anthropic", { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }], usage: { input_tokens: 1, output_tokens: 2 } }), { text: "ab", promptTokens: 1, completionTokens: 2 });
  assertEquals(parseChatResponse("openai", { choices: [{ message: { content: "a" } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }), { text: "a", promptTokens: 1, completionTokens: 2 });
});
for (const [status, code] of [[401, "key_rejected"], [429, "rate_limited"], [500, "ai_failure"]] as const) {
  Deno.test(`erro ${status} do provedor vira ${code}`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(new Response("{}", { status }))) as typeof fetch;
    try {
      const e = await assertRejects(() => callChatTarget(claude, msgs, 10), OrgAiError);
      assertEquals(e.code, code);
    } finally { globalThis.fetch = original; }
  });
}
