# admin-impersonate-switch

- LOC: 189
- Gatilho: HTTP autenticado (admin JWT).
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `impersonation_sessions`, `admin_users`, `user_organizations`.
- Tabelas escritas: `impersonation_sessions` (atualiza org alvo), `admin_audit_logs`.
- APIs externas: nenhuma.
- Observações: troca org durante impersonação. Verifica se admin tem acesso e se a org alvo existe via `user_organizations`. Audita a troca.
