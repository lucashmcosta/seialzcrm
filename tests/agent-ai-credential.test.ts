import { assertEquals } from "jsr:@std/assert@1";
import { currentAiModel, pickAgentAiCredential, RETIRED_AI_MODELS } from "../supabase/functions/_shared/intelligence/agent-ai-credential.ts";
import { AI_MODELS, RETIRED_AI_MODELS as RETIRED_NA_TELA } from "../src/lib/aiModels.ts";

const ok = { api_key_encrypted: "x", is_active: true, verified_at: "2026-11-08" };
const oldOpenai = { slug: "openai-gpt", config_values: { api_key: "antiga" } };
const oldClaude = { slug: "claude-ai", config_values: { api_key: "antiga" } };

Deno.test("agente com Claude usa a chave de Provedores de IA sem integração antiga", () => {
  const c = pickAgentAiCredential("claude-ai", { anthropic: ok }, []);
  assertEquals([c?.kind, c?.slug], ["byok", "claude-ai"]);
});
Deno.test("BYOK ganha da chave antiga do mesmo provedor", () => {
  assertEquals(pickAgentAiCredential("claude-ai", { anthropic: ok }, [oldClaude])?.kind, "byok");
});
Deno.test("sem BYOK a chave antiga continua valendo", () => {
  assertEquals(pickAgentAiCredential("claude-ai", {}, [oldClaude])?.kind, "legacy");
});
Deno.test("provedor fixo nunca usa chave de outro provedor", () => {
  assertEquals(pickAgentAiCredential("claude-ai", { openai: ok }, [oldOpenai]), null);
  assertEquals(pickAgentAiCredential("openai-gpt", { anthropic: ok }, [oldClaude]), null);
});
Deno.test("auto mantém a preferência pelo Claude", () => {
  assertEquals(pickAgentAiCredential("auto", { openai: ok }, [oldClaude])?.slug, "claude-ai");
  assertEquals(pickAgentAiCredential(null, { openai: ok }, [])?.slug, "openai-gpt");
});
Deno.test("chave inativa ou não verificada não vale", () => {
  assertEquals(pickAgentAiCredential("claude-ai", { anthropic: { ...ok, is_active: false } }, []), null);
  assertEquals(pickAgentAiCredential("claude-ai", { anthropic: { ...ok, verified_at: null } }, []), null);
});
Deno.test("modelo antigo vira o substituto e modelo atual não muda", () => {
  assertEquals(currentAiModel("claude-sonnet-4-20250514"), "claude-sonnet-5-5");
  assertEquals(currentAiModel("gpt-4o-mini"), "gpt-4o-mini");
  assertEquals(currentAiModel(null), null);
});
Deno.test("tela e backend têm a mesma lista de modelos antigos", () => {
  assertEquals(RETIRED_NA_TELA, RETIRED_AI_MODELS);
});
Deno.test("todo substituto existe na lista da tela e nenhum modelo oferecido é antigo", () => {
  const oferecidos = Object.values(AI_MODELS).flat().map((m) => m.value);
  for (const novo of Object.values(RETIRED_AI_MODELS)) assertEquals(oferecidos.includes(novo), true, novo);
  for (const m of oferecidos) assertEquals(m in RETIRED_AI_MODELS, false, m);
});
