# SuvSign (assinatura eletrônica)

## Fluxo

- **Webhook:** `suvsign-webhook` — HMAC no header. Feature flag via `_shared/feature-flags.ts`.
- Persiste PDF assinado em Storage via `attachments`, associa a `opportunities`, registra `activities`.

## Env vars

`SUVSIGN_WEBHOOK_SECRET` [INCERTO — verificar nome exato].

## Tabelas

`integration_inbound_events`, `integration_inbound_ingest_errors`, `attachments`, `opportunities`, `activities`, `organization_integrations`.

## UI

`src/components/signature/` — assinaturas ligadas a oportunidades.

## Observações

- Memory `integrations/suvsign-electronic-signature`.
