// Chave e modelo do agente. Provedor fixo no agente só aceita chave daquele provedor;
// "auto" segue a mesma regra dos recursos de texto. BYOK sempre antes da chave antiga.
import { type ByokEntry, type LegacyAiRow, pickTextAiCredential, type TextAiCredential } from "./text-ai-credential.ts";

const PROVIDER_OF_SLUG: Record<string, string> = { "claude-ai": "anthropic", "openai-gpt": "openai" };

export function pickAgentAiCredential(
  agentProvider: string | null,
  secrets: Record<string, ByokEntry>,
  legacyRows: LegacyAiRow[],
): TextAiCredential | null {
  const provider = agentProvider ? PROVIDER_OF_SLUG[agentProvider] : undefined;
  if (!provider) return pickTextAiCredential(secrets, legacyRows);
  const entry = secrets[provider];
  return pickTextAiCredential(entry ? { [provider]: entry } : {}, legacyRows.filter((r) => r.slug === agentProvider));
}

// Modelos desligados ou com data para sair, e o substituto. Espelho em src/lib/aiModels.ts
// (tests/agent-ai-credential.test.ts garante que os dois são iguais).
export const RETIRED_AI_MODELS: Record<string, string> = {
  "claude-sonnet-4-20250514": "claude-sonnet-5-5",
  "claude-3-5-sonnet-20241022": "claude-sonnet-5-5",
  "claude-3-5-haiku-20241022": "claude-haiku-5-5",
  "gpt-5.2-pro": "gpt-5.6-sol",
  "gpt-5.2-mini": "gpt-5.6-terra",
  "gpt-5": "gpt-5.6-sol",
  "gpt-5-mini": "gpt-5.6-terra",
  "o3": "gpt-5.6-sol",
  "o3-mini": "gpt-5.6-sol",
  "o1": "gpt-5.6-sol",
  "o1-mini": "gpt-5.6-terra",
  "gpt-4.5-preview": "gpt-5.6-sol",
  "gpt-4-turbo": "gpt-5.6-sol",
  "gpt-3.5-turbo": "gpt-5.6-terra",
  "google/gemini-2.5-flash": "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro": "google/gemini-3-flash-preview",
};

export function currentAiModel<T extends string | null | undefined>(model: T): T | string {
  return (model && RETIRED_AI_MODELS[model]) || model;
}
