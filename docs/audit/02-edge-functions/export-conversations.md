# export-conversations

- LOC: 212
- Gatilho: HTTP autenticado. SERVICE_ROLE.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `user_organizations`, `users`, `contacts`, `message_threads`, `messages`, `opportunities`.
- Tabelas escritas: nenhuma.
- APIs externas: nenhuma.
- Observações: monta CSV/JSON de conversas para exportação. [INCERTO] sem paginação/streaming visível — arriscado para orgs grandes.
