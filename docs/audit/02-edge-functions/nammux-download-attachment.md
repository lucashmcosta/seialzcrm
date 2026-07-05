# nammux-download-attachment

- LOC: 225
- Gatilho: HTTP autenticado.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `organization_integrations`, `attachments`, `integration_audit_logs`.
- Tabelas escritas: `attachments` (atualiza URL/status), `integration_audit_logs`.
- APIs externas: Nammux (download binário) — [INCERTO] URL derivada da config.
- Observações: baixa anexo remoto e persiste em Storage. Sanitização de URL não confirmada.
