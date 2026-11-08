import { assertEquals } from "jsr:@std/assert@1";
import { pickTextAiCredential } from "../supabase/functions/_shared/intelligence/text-ai-credential.ts";

const ok = { api_key_encrypted: "x", is_active: true, verified_at: "2026-11-08" };
const oldOpenai = { slug: "openai-gpt", config_values: { api_key: "antiga" } };
const oldClaude = { slug: "claude-ai", config_values: { api_key: "antiga" } };

Deno.test("BYOK do Claude ganha da chave antiga da OpenAI", () => {
  const c = pickTextAiCredential({ anthropic: ok }, [oldOpenai]);
  assertEquals([c?.kind, c?.slug], ["byok", "claude-ai"]);
});

Deno.test("BYOK inativa ou sem verificação é ignorada", () => {
  assertEquals(pickTextAiCredential({ anthropic: { ...ok, is_active: false } }, [oldOpenai])?.slug, "openai-gpt");
  assertEquals(pickTextAiCredential({ anthropic: { ...ok, verified_at: null } }, [])?.slug, undefined);
});

Deno.test("Sem BYOK, segue a preferência antiga pelo Claude", () => {
  const c = pickTextAiCredential({}, [oldOpenai, oldClaude]);
  assertEquals([c?.kind, c?.slug], ["legacy", "claude-ai"]);
});

Deno.test("Claude antigo vem antes de BYOK da OpenAI; linha sem chave não conta", () => {
  assertEquals(pickTextAiCredential({ openai: ok }, [oldClaude])?.kind, "legacy");
  assertEquals(pickTextAiCredential({ openai: ok }, [{ slug: "claude-ai", config_values: {} }])?.slug, "openai-gpt");
  assertEquals(pickTextAiCredential({}, []), null);
});
