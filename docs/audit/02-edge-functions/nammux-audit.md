# nammux-audit

- LOC: 95
- Gatilho: HTTP admin.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `organization_integrations` (config nammux).
- Tabelas escritas: nenhuma.
- APIs externas: `fetch("https://httpbin.org/anything", ...)` — echo diagnóstico para inspecionar payload/headers de saída. [INCERTO] uso de httpbin em produção — remover ou tornar opcional.
- Observações: função de diagnóstico da integração Nammux.
