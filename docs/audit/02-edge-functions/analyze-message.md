# analyze-message

Path: `supabase/functions/analyze-message/index.ts` (275 LOC)

## Gatilho
- Worker (autenticado por `INTELLIGENCE_WORKER_TOKEN`) — analisa mensagens (sentimento/intenção/pipeline signals) via `intelligence-worker`.

## Imports de `_shared/`
- `intelligence/analyze-prompt.ts`
- `intelligence/resolve-provider.ts`
- `intelligence/sanitize.ts` (`sanitizeProviderError`, `safeLog`)
- `intelligence/log-usage.ts` (`logAiUsage`)
- `intelligence/pricing.ts` (`estimateTextCostUsd`)
- `intelligence/settings.ts` (`getIntelligenceSettings`, `shouldAnalyze`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_WORKER_TOKEN`

## Tabelas — LEITURA
- `messages`, `message_analyses`, `message_threads`, `opportunities`

## Tabelas — ESCRITA
- `message_analyses` (upsert)
- `sales_events` (insert — sinais de venda detectados)
- `messages` (update — flags de análise)
- `opportunities` (update — [INCERTO] atualização de stage/score)

## APIs externas
- Nenhuma direta (delega ao provider resolvido em `resolve-provider.ts`).

## Observações
- Bom exemplo de function pequena e limpa apoiada em `_shared/intelligence/*`.
