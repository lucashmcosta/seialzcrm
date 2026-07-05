# outbox-health

- LOC: 42
- Gatilho: HTTP autenticado via `OUTBOX_HEALTH_TOKEN` (header).
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OUTBOX_HEALTH_TOKEN`.
- Tabelas lidas: via RPC.
- RPC: `fn_outbox_health_summary_internal` (agrega estatísticas de outbox).
- APIs externas: nenhuma.
- Observações: endpoint de monitoramento simples. Toda a lógica na função SQL.
