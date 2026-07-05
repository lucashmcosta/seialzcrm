# admin-impersonate-end

- LOC: 76
- Gatilho: HTTP autenticado (admin JWT).
- Imports: `npm:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas/escritas: `impersonation_sessions` (marca sessão como encerrada).
- APIs externas: nenhuma.
- Observações: contraparte de `admin-impersonate`. Não parece gravar `admin_audit_logs` no encerramento — divergência com `admin-impersonate`/`admin-impersonate-switch` que auditam. [INCERTO] falta de trilha de auditoria no end.
