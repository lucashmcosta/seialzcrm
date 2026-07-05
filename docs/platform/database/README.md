# Platform — Database

**Fontes:** `docs/reference/database/database-full.md` (gerado do banco vivo 2026-07-04), `docs/audit/05-multi-tenancy.md`, `docs/operations/drift/2026-07-04.md`.

## Números reais (2026-07-04)

| Métrica | Valor |
|---|---|
| Tabelas em `public` | **117** |
| Functions Postgres | **257** (48 trigger + ~85 RPCs/helpers + ~124 do pgvector) |
| Triggers ativas | **107** |
| Views | **11** |
| Policies RLS | **232** — cobertura total (0 tabelas sem RLS) |
| Cron jobs | **15** |
| Edge functions deployadas | **88** (repo tem 90 arquivos + 3 fora do repo → drift) |
| Tabelas no realtime | 7 (`calls`, `document_submissions`, `document_types`, `import_logs`, `message_threads`, `messages`, `notifications`) |
| Migrations aplicadas | **184** (repo tem 261 → drift #4) |
| Postgres | 17 (sa-east-1) |

## Extensões

`plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault 0.3.1`, `hypopg`, `index_advisor`, `pg_trgm`, `unaccent`, **`vector 0.8.0`** (pgvector — knowledge embeddings), **`pg_cron 1.6.4`**, **`pg_net 0.19.5`** (http_post de dentro do banco — usado por todos os crons).

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
- `current_user_managed_org_ids()` — orgs onde é admin.
- `user_has_org_access(org_id)`, `is_org_admin(_org_id)`, `has_org_role(_user_id, _org_id, _role)`, `is_admin_user()`.
- `user_can_view_all(_org_id, _entity)`, `user_has_cs_permission(_org, _perm)`, `can_manage_integrations_in_org(_org_id)`, `can_review_contact_documents(_contact_id)`.
- `has_role(_user_id, _role)` — checagem de role sem recursão.
- `get_internal_function_auth_token()` — Vault → edge functions (nunca expor).

## Convenções de nomenclatura

- **Triggers**: `trg_<tabela>_<ação>` → function `fn_<verbo>_<objeto>` (legado sem prefixo existe; novo código segue o padrão).
- **RPCs chamadas pelo frontend**: prefixo `rpc_`.
- **Helpers internos**: prefixo `fn_`.
- **Ownership de cada objeto**: `docs/reference/catalog.md`.

## Realtime

- Ativado via `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.
- Subscribers passam pelo RLS — só recebem o que podem ler.
- Regra frontend: `supabase.channel(...).subscribe()` **sempre** dentro de `useEffect` com cleanup `removeChannel`.

## Drift ativo (2026-07-04)

Ver `docs/operations/drift/2026-07-04.md` — itens que afetam schema:

- **P0 #1**: triggers de auditoria duplicadas em `contacts`, `opportunities`, `tasks` (`audit_logs` = 463 MB / 292 K linhas).
- **P0 #2**: `marketing-campaign-enrich`, `twilio-message-debug`, `meta-capi-raw-test` deployadas fora do repo.
- **P1 #4**: 184 migrations no banco vs 261 no repo.
- **P2 #6**: 8 tabelas de backfill/backup em `public` (`messages_endpoint_backfill_2b` = 92 K linhas!). Padrão futuro: schema `_scratch`.
- **P2 #7**: overloads a consolidar (`rpc_list_message_threads`, `validate_message_analysis_v2/v21`, `assign_round_robin`).
- **P2 #8**: UUID da Central Trabalhista hardcoded em `parse_lead_source_marker_from_message`.

## Regeneração

Queries no rodapé de `docs/reference/database/database-full.md`. Regra ADR-0007: alterou schema/trigger/RPC → regenerar no mesmo PR.
