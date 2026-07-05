# admin-impersonate

- LOC: 158
- Gatilho: HTTP autenticado. Cliente com JWT do admin; SERVICE_ROLE para escrita.
- Imports: `npm:@supabase/supabase-js@2`, `https://deno.land/std@0.168.0/http/server.ts`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `admin_users` (valida flag admin), `users` (usuário alvo).
- Tabelas escritas: `impersonation_sessions` (cria sessão), `admin_audit_logs` (registro de auditoria).
- APIs externas: nenhuma.
- Observações: entrypoint de impersonação. [INCERTO] valida `admin_users.is_active` e persiste sessão com expiração. Sem uso de `_shared/`.
