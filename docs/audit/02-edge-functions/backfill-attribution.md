# backfill-attribution

Path: `supabase/functions/backfill-attribution/index.ts` (144 LOC)

## Gatilho
- Chamada manual/admin — recomputa atribuição de campanha para contatos existentes.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `contacts` (múltiplas iterações)
- `marketing_campaigns`

## Tabelas — ESCRITA
- `contacts` (update — campos de atribuição)

## APIs externas
- Nenhuma.

## Observações
- Script one-shot (backfill), sem paginação óbvia — risco em orgs grandes. [INCERTO] se há LIMIT/cursor.
