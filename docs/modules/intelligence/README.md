# Módulo: Intelligence

Análises automáticas de conversas — ghosting, resposta, rollups diários.

## Comportamento
- Jobs assíncronos em `intelligence_jobs` claim/lease.
- Backfill runner + ghosting detector + rollup + retention.

## Edge functions
- `intelligence-worker` (dispatcher a cada 30s, autenticação `x-worker-token`).
- `intelligence-backfill-runner`, `intelligence-ghosting-detector`, `intelligence-rollup-cron`, `intelligence-retention-cron`.
- Handlers acionados por handler-name (ex.: `analyze-message`).

## Análise da conversa inteira
Regra: a análise lê sempre a conversa inteira, nunca só uma mensagem. Ela roda dentro da org, com a chave do Claude da própria org (sem chave, não roda), e o resultado fica nas tabelas da org.

- `conversation-analysis` (só admin da org). Ações:
  - `start`: sorteia oportunidades ganhas e perdidas com conversa de verdade (2+ mensagens do cliente e 1+ resposta de pessoa da equipe) e monta cada conversa completa, com áudios transcritos e em ordem. Manda tudo em lote para a Anthropic, que cobra metade do preço. Com `dry_run` só devolve o custo estimado, e recusa se o custo estimado passar de `budget_usd`.
  - `poll`: grava as análises e o custo real, e registra o uso em `ai_usage_logs`.
  - `report`: compara ganhas e perdidas e devolve o que funciona, onde a conversa morre, as objeções e as regras para o prompt de agente.
  - `cancel` e `status`.
- O prompt é genérico e usa `intelligence_settings.analysis_profile` (modelo e descrição do negócio). As regras puras estão em `_shared/intelligence/conversation-analysis.ts`, com testes em `tests/conversation-analysis.test.ts` (Deno).

## Cron
Ver `docs/audit/06-cron-automacoes.md`:
- `intelligence-worker-30s` (30s)
- `intelligence-ghosting-hourly` (`0 * * * *`)
- `intelligence-rollup-daily` (`15 3 * * *`)
- `intelligence-retention-daily` (`30 4 * * *`)
- `intelligence-backfill-tick` (`*/2 * * * *`)
- `intelligence-reap-stale-jobs` (`*/5 * * * *`)
