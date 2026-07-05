# admin-list-orgs-for-switch

- LOC: 71
- Gatilho: HTTP autenticado (admin JWT).
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `impersonation_sessions` (valida sessão ativa), `organizations` (lista).
- Tabelas escritas: nenhuma.
- APIs externas: nenhuma.
- Observações: alimenta o seletor de org durante impersonação. Read-only.
