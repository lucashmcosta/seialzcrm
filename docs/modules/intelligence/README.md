# Módulo: Intelligence

Análises automáticas de conversas — ghosting, resposta, rollups diários.

## Comportamento
- Jobs assíncronos em `intelligence_jobs` claim/lease.
- Backfill runner + ghosting detector + rollup + retention.

## Edge functions
- `intelligence-worker` (dispatcher a cada 30s, autenticação `x-worker-token`).
- `intelligence-backfill-runner`, `intelligence-ghosting-detector`, `intelligence-rollup-cron`, `intelligence-retention-cron`.
- Handlers acionados por handler-name (ex.: `analyze-message`).

## Cron
Ver `docs/audit/06-cron-automacoes.md`:
- `intelligence-worker-30s` (30s)
- `intelligence-ghosting-hourly` (`0 * * * *`)
- `intelligence-rollup-daily` (`15 3 * * *`)
- `intelligence-retention-daily` (`30 4 * * *`)
- `intelligence-backfill-tick` (`*/2 * * * *`)
- `intelligence-reap-stale-jobs` (`*/5 * * * *`)
