# Platform — Database

**Fonte:** `docs/audit/05-multi-tenancy.md`, `<supabase-tables>`.

## Números
- 261 migrations em `supabase/migrations/`.
- ~112 tabelas em `public` (ver `<supabase-tables>` do prompt do sistema).

## Padrões

### Grants obrigatórios
Toda `CREATE TABLE public.*` deve ter GRANT antes de `ENABLE RLS`:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
-- anon apenas se explicitamente público
```

### RLS pattern
```sql
using (organization_id = ANY(current_user_org_ids()))
with check (organization_id = ANY(current_user_org_ids()))
```
Uso obrigatório de `ANY(current_user_org_ids())` (não subquery IN) para forçar InitPlan e evitar avaliação per-row.

### Funções SECURITY DEFINER base
- `current_user_id()` — retorna `users.id` a partir de `auth.uid()`.
- `current_user_org_ids()` — array de UUIDs.
- `has_role(_user_id, _role)`.
- `get_internal_function_auth_token()` — cron → edge functions.

## Realtime
- Ativado via `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.
- Subscribers passam pelo RLS (só recebem o que podem ler).
- Regra frontend: `supabase.channel(...).subscribe()` **sempre** dentro de `useEffect` com cleanup `removeChannel`.

## Tabelas de backup/backfill (candidatas a arquivamento)
- `backup_meta_backfill_2026_05_28_contacts`
- `opportunities_status_backup_20260512`
- `message_threads_business_context_backfill*` (3)
- `message_threads_primary_endpoint_backfill`
- `messages_endpoint_backfill_2b`
- `viagi_csv_staging_2026_05_28` (nome versionado — provavelmente antigo)

## Backups Kommo
`import_logs` (40 col) atua como registro reversível.
