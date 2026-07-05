# intelligence-backfill-runner

- LOC: 391
- Gatilho: HTTP (cron/admin) autenticado via `INTELLIGENCE_WORKER_TOKEN`.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_WORKER_TOKEN`.
- Tabelas lidas: `ai_usage_logs`, `intelligence_jobs`, `messages`, `message_analyses`, `intelligence_backfill_runs`.
- Tabelas escritas: `intelligence_jobs` (enqueue), `intelligence_backfill_runs` (progresso/status).
- APIs externas: nenhuma direta.
- Observações: runner de longa duração que enfileira jobs `analyze-message` para lotes históricos de `messages`. Gerencia estado em `intelligence_backfill_runs` com cursores.
