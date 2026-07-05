# integration-worker

Path: `supabase/functions/integration-worker/index.ts` (247 LOC)

## Gatilho
- `POST` — worker de jobs de integração outbound (Kommo, etc). Consome `integration_jobs` via RPC `rpc_claim_integration_jobs`.
- Protegido por token: header conferido contra `INTEGRATION_WORKER_TOKEN`.

## Imports de `_shared/`
- `integration-handlers/types.ts`
- `integration-handlers/registry.ts` (`resolveHandler`) — pattern registry

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTEGRATION_WORKER_TOKEN`

## Tabelas — LEITURA
- `integration_jobs`
- `integration_subscriptions`
- `integration_events`
- `external_mappings`

## Tabelas — ESCRITA
- `integration_jobs` (update — status/attempts)
- `integration_audit_logs` (insert)
- `external_mappings` (upsert)

## RPC chamadas
- `rpc_claim_integration_jobs`
- `fn_schedule_retry`

## APIs externas
- Depende do handler resolvido (`registry.ts`). Não faz fetch direto no arquivo raiz.

## Observações
- Arquitetura limpa (registry + handlers) — bom contraponto à duplicação vista em `_whatsapp-*`.
- Auth por token compartilhado (não JWT/service-role via header padrão).
