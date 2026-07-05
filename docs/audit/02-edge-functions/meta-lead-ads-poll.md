# meta-lead-ads-poll

Path: `supabase/functions/meta-lead-ads-poll/index.ts` (237 LOC)

## Gatilho
- Cron — puxa leads novos de forms ativos periodicamente (autenticado via `validateServiceRoleAuth`).

## Imports de `_shared/`
- `cors.ts`, `crypto.ts` (`decryptSecret`), `meta-graph.ts` (`metaGraphGet`, `isTokenError`), `notify.ts` (`notifyOrgUsers`), `auth.ts` (`validateServiceRoleAuth`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `lead_forms`, `meta_lead_pages`, `organization_integrations`

## Tabelas — ESCRITA
- `lead_forms` (update — cursor `since`, status, `last_polled_at`)

## RPC
- `try_lead_form_polling_lock` (lock cooperativo para evitar polls concorrentes)

## APIs externas
- Meta Graph API `/{form-id}/leads?since=...`.

## Chamadas para outras functions
- `POST ${SUPABASE_URL}/functions/v1/meta-lead-ads-process-lead` — dispara processamento por lead.

## Observações
- Padrão limpo: lock via RPC + polling + fan-out. Notifica usuários em caso de erro de token.
