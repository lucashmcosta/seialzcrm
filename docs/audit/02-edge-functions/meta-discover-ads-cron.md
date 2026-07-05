# meta-discover-ads-cron

Path: `supabase/functions/meta-discover-ads-cron/index.ts` (309 LOC)

## Gatilho
- Cron — descobre e sincroniza campanhas/adsets/ads da Meta em `marketing_campaigns`.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`

## Tabelas — ESCRITA
- `marketing_campaigns` (insert/update — 3 pontos)

## RPC
- `get_meta_credentials`
- `get_internal_function_auth_token`

## APIs externas
- Meta Graph API (campaigns/adsets/ads).

## Observações
- Complementar de `marketing-insights-sync-daily` (métricas). Este cuida da estrutura, o outro dos insights numéricos.
