# Meta Conversions API (CAPI)

## Fluxo

- **Conexão:** `meta-capi-connect` (novo) ou `meta-capi-connect-from-existing` (reuso de Meta Ads Manager já conectado).
- **Envio:** `meta-capi-send-event` (server-side). Log em `capi_event_log`.
- **Retry cron:** `meta-capi-retry-cron` reprocessa falhas.

## Env vars

`META_APP_SECRET` (para HMAC via `_shared/meta-token.ts`).

## Tabelas

`organization_integrations`, `capi_event_log`, `marketing_campaigns` (correlação).

## UI

`src/components/integrations/meta-capi/MetaCapiDialog.tsx`.

## Observações

- Fluxo separado do WhatsApp Meta mas compartilha token/app id.
- Backfill de Viagi: `meta-lead-ads-backfill-viagi` reenvia para CAPI.
