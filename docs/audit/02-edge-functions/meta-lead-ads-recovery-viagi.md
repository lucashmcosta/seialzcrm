# meta-lead-ads-recovery-viagi

Path: `supabase/functions/meta-lead-ads-recovery-viagi/index.ts` (349 LOC)

## Gatilho
- Chamada manual — recuperação específica de leads Viagi (busca no Graph e recria contatos ausentes).

## Imports de `_shared/`
- `cors.ts`, `crypto.ts` (`decryptSecret`), `meta-graph.ts` (`metaGraphGet`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `meta_lead_pages`, `organization_integrations`, `lead_forms`, `contacts` (múltiplas)

## Tabelas — ESCRITA
- `contacts` (insert/update — múltiplos)

## RPC
- `get_internal_function_auth_token`

## APIs externas
- Meta Graph API.

## Observações
- Código org-specific em produção (Viagi). Ver `meta-lead-ads-backfill-viagi`.
