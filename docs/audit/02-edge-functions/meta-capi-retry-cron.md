# meta-capi-retry-cron

Path: `supabase/functions/meta-capi-retry-cron/index.ts` (53 LOC)

## Gatilho
- Cron — reprocessa eventos CAPI falhados.

## Imports de `_shared/`
- `cors.ts`

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `capi_event_log` (busca eventos com status de retry)

## Tabelas — ESCRITA
- Nenhuma direta (delega ao `meta-capi-send-event`).

## APIs externas
- Nenhuma.

## Chamadas para outras functions
- `POST ${SUPABASE_URL}/functions/v1/meta-capi-send-event`

## Observações
- Function muito enxuta — apenas fan-out.
