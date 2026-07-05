# kommo-migrate

- LOC: 575 (função monolítica de importação)
- Gatilho: HTTP admin. SERVICE_ROLE direto.
- Imports: `jsr:@supabase/supabase-js@2`. Sem `_shared/`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `import_logs`, `user_organizations`, `custom_field_definitions`, `companies`, `contacts`, `opportunities`, `activities`, `tasks`, `kommo_user_mappings`.
- Tabelas escritas: `import_logs` (progresso), `custom_field_definitions` (upsert), `companies`, `contacts`, `opportunities`, `tasks`, `activities`, `kommo_user_mappings`.
- RPC: `rpc_kommo_upsert_contact`, `rpc_kommo_upsert_opportunity` (upserts idempotentes com dedup por kommo_id).
- APIs externas: Kommo REST via helper `fetch(url, opts)` genérico (contacts, leads, companies, tasks, events, users).
- Observações: função extensa que pagina Kommo e faz upsert em várias tabelas. Deveria ser quebrada. [INCERTO] sem sanitização explícita de subdomínio (memory recomenda). `import_logs` fornece base para rollback (`kommo-rollback`).
