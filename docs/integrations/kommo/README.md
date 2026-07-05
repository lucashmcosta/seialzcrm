# Kommo CRM (import + mirror)

**Referência técnica:** `docs/audit/04-integracoes/kommo.md`.

## Finalidade
Migração one-shot de dados do Kommo + espelhamento unidirecional (Seialz → Kommo, via outbox `integration_jobs`).

## Fluxo
1. `kommo-validate` — credenciais.
2. `kommo-fetch-pipelines` — pipelines + usuários.
3. `kommo-preview` — contagem/amostra.
4. `kommo-migrate` (575 LOC) — paginação → RPCs `rpc_kommo_upsert_contact` / `rpc_kommo_upsert_opportunity` + `import_logs`.
5. `kommo-fix-owners` — corrige owners pós-import via `kommo_user_mappings`.
6. `kommo-media-download` — baixa anexos.
7. `kommo-rollback` — reverte via `import_logs`.

## Autenticação
Credenciais (long-lived token + subdomain) fornecidas no body — não há env global.

## Tabelas
`import_logs` (40 col), `kommo_user_mappings`, `contacts`, `companies`, `opportunities`, `tasks`, `activities`, `custom_field_*`.

## UI
`src/components/settings/Kommo*`, hook `useKommoMigration`.

## Falhas / dívida
- 🔴 Falta sanitização de subdomínio em `kommo-fetch-pipelines`, `kommo-preview`, `kommo-migrate`.
- 🔴 SSRF em `kommo-media-download` (baixa URL sem allowlist).
- 🟡 `kommo-rollback` não apaga contatos/oportunidades diretamente — verificar completude.
- 🟡 `kommo-migrate` monolítico — quebrar por entidade.

## Rate limits
Kommo: 7 req/s por account (aproximado).
