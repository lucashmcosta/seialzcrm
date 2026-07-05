# meta-capi-connect

Path: `supabase/functions/meta-capi-connect/index.ts` (152 LOC)

## Gatilho
- Chamada do frontend — conecta Meta Conversions API (CAPI) usando token novo fornecido pelo usuário.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`encryptSecret`)
- `meta-graph.ts` (`metaGraphGet`, `MetaGraphError`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (upsert credenciais CAPI cifradas)

## APIs externas
- Meta Graph API (via `metaGraphGet`) — valida `pixel_id` / `dataset_id` e token.

## Observações
- Par com `meta-capi-connect-from-existing` (reusa token já conectado em outro contexto Meta).
