# nammux-test-connection

- LOC: 157
- Gatilho: HTTP autenticado.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `organization_integrations` (credenciais Nammux).
- Tabelas escritas: nenhuma.
- APIs externas: Nammux (HTTP GET/POST configurável) para validar conectividade.
- Observações: usado no wizard de conexão. [INCERTO] validação de host/URL.
