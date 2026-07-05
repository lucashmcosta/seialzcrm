# kommo-fix-owners

- LOC: 195
- Gatilho: HTTP admin. Usa SERVICE_ROLE direto.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `user_organizations`, `kommo_user_mappings`, `contacts`, `opportunities`.
- Tabelas escritas: `kommo_user_mappings`, `contacts` (owner_id), `opportunities` (owner_id).
- APIs externas: Kommo REST (via helper `fetch(url, opts)` genérico) — busca usuários Kommo por org para reconciliar mapeamento.
- Observações: rotina one-shot de correção de responsáveis pós-migração. Relacionado a `kommo-mirror-system-v2`. Não é idempotente por padrão — ler antes de rodar. [INCERTO] sanitização de subdomínio.
