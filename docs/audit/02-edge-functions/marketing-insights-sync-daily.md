# marketing-insights-sync-daily

Path: `supabase/functions/marketing-insights-sync-daily/index.ts` (402 LOC)

## Gatilho
- Cron diário — sincroniza métricas (spend/impressions/clicks) da Meta Ads em `marketing_campaign_insights_daily`.

## Imports de `_shared/`
- `cors.ts`, `crypto.ts` (`decryptSecret`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `marketing_campaigns`, `contacts`, `admin_integrations`, `organization_integrations`, `marketing_campaign_insights_daily`

## Tabelas — ESCRITA
- `marketing_campaigns` (update — cache de métricas)
- `marketing_campaign_insights_daily` (upsert)
- `organization_integrations` (update — sync status)

## RPC
- `get_internal_function_auth_token`, `get_meta_credentials`

## APIs externas
- Meta Graph API `/insights`.

## Observações
- Par com `meta-discover-ads-cron` (estrutura ↔ métricas).
