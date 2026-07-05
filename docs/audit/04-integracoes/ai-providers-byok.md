# AI Providers (BYOK)

Suporte Claude / OpenAI / Gemini via BYOK (Bring Your Own Key) por organização.

## Fluxo

- `byok-set-key` — grava chave criptografada em `organization_integrations` + `intelligence_settings`.
- `byok-rotate-key` — mesma lógica, mantém histórico.
- `byok-test-key` — testa contra provider antes de ativar.
- `byok-revoke-key` — desabilita.
- `byok-update-policy` — atualiza política de uso (limits, defaults).
- `migrate-legacy-ai-key` — migra do schema antigo (`admin_integrations`) para BYOK.

## Uso

- `ai-agent-respond` (2372 LOC) escolhe provider ativo por org.
- `ai-generate` — LLM simples.
- `enhance-knowledge`, `classify-agent-feedback`, `knowledge-edit`, `wizard-*`, `synthesize-knowledge` — usam Lovable AI Gateway ou BYOK conforme configuração.

## Módulos compartilhados

`supabase/functions/_shared/intelligence/` — `byok-shared.ts`, `authz.ts`. `_shared/crypto.ts` para encrypt/decrypt.

## Tabelas

`organization_integrations`, `intelligence_settings`, `intelligence_settings_audit`.

## UI

`src/components/settings/AIProvidersSettings.tsx`, `AIProviderCard.tsx`, `AIProviderConfigDialog.tsx`.

## Observações

- Memory `features/ai-agent/multi-model-duplication`, `features/ai-agent/model-compatibility-consolidated`.
- Visibilidade de UI condicional (memory `features/ai-agent/ui-visibility-logic`).
