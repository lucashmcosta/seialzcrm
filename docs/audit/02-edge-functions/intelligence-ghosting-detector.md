# intelligence-ghosting-detector

- LOC: 82
- Gatilho: cron via `INTELLIGENCE_WORKER_TOKEN`.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_WORKER_TOKEN`.
- Tabelas lidas: `intelligence_settings`, `opportunities`, `message_threads`, `sales_events`.
- Tabelas escritas: `sales_events` (insere eventos do tipo ghosting).
- APIs externas: nenhuma.
- Observações: detecta oportunidades sem resposta há X dias (thresholds em `intelligence_settings`) e registra `sales_events` para dashboards.
