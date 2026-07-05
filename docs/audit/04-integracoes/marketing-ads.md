# Marketing Ads (Meta Ads insights + campanhas)

## Fluxo

- **Conta de anúncios:** `meta-ads-manager-save` (persistência de contas).
- **Descoberta:** `meta-discover-ad-accounts` + cron `meta-discover-ads-cron` (`30 5 * * *`).
- **Insights diários:** `marketing-insights-sync-daily` (cron `0 6 * * *`) — Meta Graph `/insights` → `marketing_campaign_insights_daily`.
- **Backfills:** `backfill-attribution`, `ct-backfill-once` (one-shots).

## Env vars

`META_APP_SECRET`, `META_GRAPH_VERSION`, `INTERNAL_FUNCTION_AUTH_TOKEN` (via RPC `get_internal_function_auth_token`).

## Tabelas

`marketing_campaigns`, `marketing_campaign_insights_daily`, `marketing_campaign_spend_history`, `marketing_attribution_ambiguities`.

## UI

`src/pages/marketing/*` — Overview, Ads list/detail, Funnel, Timeline. Único módulo que usa `react-query` de forma consistente.

## Observações

- Attribution engine grava ambiguidades para revisão manual (`marketing_attribution_ambiguities`).
- `viagi-staging-loader` — one-shot que usa import quebrado `npm:@supabase/supabase-js@2/cors` (registrado em `viagi-staging-loader.md`).
