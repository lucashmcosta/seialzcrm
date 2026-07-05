# nammux-replay-opportunity

- LOC: 248
- Gatilho: HTTP autenticado.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.
- Tabelas lidas: `opportunities`, `users`, `user_organizations`, `permission_profiles`, `integration_subscriptions`, `integration_events`.
- Tabelas escritas: `integration_events` (insere reprocessável), `integration_jobs` (enqueue), `integration_audit_logs`.
- APIs externas: nenhuma direta — reencaminha via `integration-worker`.
- Observações: reemite eventos para o pipeline `integration-inbound-dispatcher`/`integration-worker`. Usa ANON para validar JWT do chamador antes de escalar para SERVICE_ROLE.
