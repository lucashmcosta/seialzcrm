# create-user

- LOC: 294
- Gatilho: HTTP autenticado. Cria cliente com ANON_KEY (valida JWT do chamador) e outro com SERVICE_ROLE (escritas).
- Imports: `npm:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `users`, `user_organizations`, `subscriptions`, `subscription_usage`, `organizations`, `pipeline_stages`, `permission_profiles`.
- Tabelas escritas: `users` (upsert), `user_organizations` (vincula), `subscription_usage` (incrementa seat), `subscriptions` (leitura+update conforme limite).
- APIs externas: `auth.admin.createUser` (Supabase Auth) via SERVICE_ROLE.
- Observações: criação direta em nível de organização (memory `users/direct-account-creation-organization-level`). Enforce de seat via `subscriptions`/`subscription_usage`. Sem uso de `_shared/`. Duplica lógica de RLS/roles que poderia usar `has_role`.
