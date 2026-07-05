# meta-lead-ads-token-health

Path: `supabase/functions/meta-lead-ads-token-health/index.ts` (99 LOC)

## Gatilho
- Cron — health check dos tokens Meta Lead Ads.

## Imports de `_shared/`
- `cors.ts`, `crypto.ts` (`decryptSecret`), `meta-graph.ts` (`metaGraphGet`, `isTokenError`), `notify.ts` (`notifyOrgUsers`), `auth.ts` (`validateServiceRoleAuth`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `admin_integrations`, `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (update — status/last_health_check)

## APIs externas
- Meta Graph API (`/me` ou similar para ping).

## Observações
- Notifica usuários da org quando token expira.
