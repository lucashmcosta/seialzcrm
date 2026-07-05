# health

- LOC: 106
- Gatilho: HTTP público (health check).
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`, `SENTRY_RELEASE`, `ENVIRONMENT`.
- Tabelas lidas: `users` (query trivial de ping).
- Tabelas escritas: nenhuma.
- APIs externas: Sentry (se DSN presente) para reportar.
- Observações: retorna versão, release e status do DB. Público — não expõe dados sensíveis.
