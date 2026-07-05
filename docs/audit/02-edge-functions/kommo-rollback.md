# kommo-rollback

- LOC: 210
- Gatilho: HTTP admin. SERVICE_ROLE direto.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `import_logs`, `user_organizations`.
- Tabelas escritas (delete): `custom_field_values`, `activities`, `contact_memories`, `custom_field_definitions`, `kommo_user_mappings`, `import_logs`.
- APIs externas: nenhuma.
- Observações: reverte migração usando `import_logs` como base. [INCERTO] não apaga `contacts`/`opportunities`/`companies` diretamente — assume que rollback é limitado a metadados/mapeamentos, ou espera cascade via FK. Verificar se o rollback está completo.
