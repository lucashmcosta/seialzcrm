// Escolhe a credencial dos recursos de texto (melhorar texto, sugerir resposta etc.).
// Regra pura, testada em tests/text-ai-credential.test.ts. Mantém a preferência antiga pelo
// Claude, e a chave BYOK ativa e verificada vem antes da chave antiga do mesmo provedor.
export interface ByokEntry {
  api_key_encrypted?: string;
  is_active?: boolean;
  verified_at?: string | null;
  monthly_budget_usd?: number | string | null;
  preferred_model?: string | null;
}

export interface LegacyAiRow {
  slug: string;
  config_values: Record<string, any> | null;
}

export type TextAiCredential =
  | { kind: "byok"; slug: "claude-ai" | "openai-gpt"; provider: "anthropic" | "openai"; entry: ByokEntry }
  | { kind: "legacy"; slug: "claude-ai" | "openai-gpt"; config: Record<string, any> };

const usable = (e?: ByokEntry) => !!(e?.is_active && e.verified_at && e.api_key_encrypted);

export function pickTextAiCredential(
  secrets: Record<string, ByokEntry>,
  legacyRows: LegacyAiRow[],
): TextAiCredential | null {
  const legacy = (slug: string) => {
    const config = legacyRows.find((r) => r.slug === slug)?.config_values;
    return config?.api_key ? config : null;
  };
  if (usable(secrets.anthropic)) return { kind: "byok", slug: "claude-ai", provider: "anthropic", entry: secrets.anthropic };
  const claude = legacy("claude-ai");
  if (claude) return { kind: "legacy", slug: "claude-ai", config: claude };
  if (usable(secrets.openai)) return { kind: "byok", slug: "openai-gpt", provider: "openai", entry: secrets.openai };
  const openai = legacy("openai-gpt");
  if (openai) return { kind: "legacy", slug: "openai-gpt", config: openai };
  return null;
}
