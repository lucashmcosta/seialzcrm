# intelligence-rollup-cron

- LOC: 148
- Gatilho: cron via `INTELLIGENCE_WORKER_TOKEN`.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_WORKER_TOKEN`.
- Tabelas lidas: `opportunities`, `message_threads`, `messages`, `sales_events`, `message_response_times`.
- Tabelas escritas: `message_response_times`, `seller_metrics_daily`, `opportunity_behavior_snapshot`.
- APIs externas: nenhuma.
- Observações: agrega métricas diárias por vendedor/oportunidade a partir de `messages` e `sales_events`. Escreve snapshots comportamentais consumidos por dashboards.
