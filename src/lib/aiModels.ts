// Modelos que o agente oferece. O agente usa ferramentas pela Chat Completions, então só entra
// aqui modelo da OpenAI que faz isso sem ajuste (GPT-6.1 Terra, por exemplo, exige a Responses API).
export const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  'claude-ai': [
    { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (Recomendado)' },
    { value: 'claude-opus-5-5', label: 'Opus 5.5 (Mais preciso)' },
    { value: 'claude-haiku-5-5', label: 'Haiku 5.5 (Mais rápido e econômico)' },
  ],
  'openai-gpt': [
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra (Recomendado)' },
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (Mais preciso)' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (Mais econômico)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
};

// Espelho de supabase/functions/_shared/intelligence/agent-ai-credential.ts.
export const RETIRED_AI_MODELS: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-5-5',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-5-5',
  'claude-3-5-haiku-20241022': 'claude-haiku-5-5',
  'gpt-5.2-pro': 'gpt-5.6-sol',
  'gpt-5.2-mini': 'gpt-5.6-terra',
  'gpt-5': 'gpt-5.6-sol',
  'gpt-5-mini': 'gpt-5.6-terra',
  'o3': 'gpt-5.6-sol',
  'o3-mini': 'gpt-5.6-sol',
  'o1': 'gpt-5.6-sol',
  'o1-mini': 'gpt-5.6-terra',
  'gpt-4.5-preview': 'gpt-5.6-sol',
  'gpt-4-turbo': 'gpt-5.6-sol',
  'gpt-3.5-turbo': 'gpt-5.6-terra',
};

/** Agente salvo com modelo antigo: é o substituto que roda, então é ele que a tela mostra. */
export function currentAiModel(model: string | null | undefined): string {
  return (model && RETIRED_AI_MODELS[model]) || model || '';
}

export function aiModelShortLabel(model: string): string {
  const current = currentAiModel(model);
  const found = Object.values(AI_MODELS).flat().find((m) => m.value === current);
  return found ? found.label.replace(/\s*\(.*\)$/, '') : current;
}
