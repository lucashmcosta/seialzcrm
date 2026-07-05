# meta-lead-ads-backfill-viagi

Path: `supabase/functions/meta-lead-ads-backfill-viagi/index.ts` (493 LOC)

## Gatilho
- Chamada manual — backfill específico do cliente Viagi (nome hardcoded no arquivo).

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `contacts`, `marketing_campaigns`, `opportunities`, `capi_event_log`

## Tabelas — ESCRITA
- `contacts` (update), `opportunities` (update — múltiplos)

## APIs externas
- Nenhuma direta.

## Chamadas para outras functions
- `POST ${SUPABASE_URL}/functions/v1/meta-capi-send-event`

## Observações
- Código org-specific (Viagi) em produção. Marca de dívida técnica: scripts one-shot deveriam ficar fora do repo de functions ou ser removidos após execução.
