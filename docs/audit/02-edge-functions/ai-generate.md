# ai-generate

Path: `supabase/functions/ai-generate/index.ts` (374 LOC)

## Gatilho
- Chamada do frontend — geração ad-hoc de texto (ex.: improve message, gerar sugestões). [INCERTO] pontos exatos de uso.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`, `organization_integrations` (para credenciais/BYOK)

## Tabelas — ESCRITA
- `ai_usage_logs` (insert)

## APIs externas
- `https://api.anthropic.com/v1/messages`
- `https://api.openai.com/v1/chat/completions`

## Observações
- Paralelo funcional com `ai-agent-respond` mas simplificado (sem RAG, sem tools). Consolidação parcial via um cliente LLM compartilhado seria útil.
