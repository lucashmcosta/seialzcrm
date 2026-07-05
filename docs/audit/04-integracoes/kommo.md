# Kommo (import + mirror)

## Fluxo

- **Validate:** `kommo-validate` (credentials).
- **Fetch pipelines/users:** `kommo-fetch-pipelines`.
- **Preview:** `kommo-preview` (contagem/amostra).
- **Migrate:** `kommo-migrate` (575 LOC) — paginação Kommo → RPCs `rpc_kommo_upsert_contact`/`rpc_kommo_upsert_opportunity` + `import_logs`.
- **Rollback:** `kommo-rollback` — reverte via `import_logs`.
- **Fix owners:** `kommo-fix-owners`.
- **Media download:** `kommo-media-download`.

## Env vars

Nenhuma global — credenciais e subdomain vêm do body/organização.

## Tabelas

`import_logs`, `kommo_user_mappings`, `contacts`, `companies`, `opportunities`, `tasks`, `activities`, `custom_field_definitions`, `custom_field_values`.

## UI

`src/components/settings/Kommo*` (Credentials, Preview, Pipeline mapping, User mapping, Progress). Hook `useKommoMigration`.

## Observações

- Memory `integrations/kommo-mirror-system-v2` — sistema unidirecional com rollback.
- [INCERTO] falta sanitização de subdomínio em `kommo-fetch-pipelines`/`kommo-migrate`/`kommo-preview` (memory `development/edge-function-subdomain-sanitization`).
- `kommo-rollback` não apaga `contacts`/`opportunities` — verificar completude.
