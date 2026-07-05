# meta-lead-ads-connect

Path: `supabase/functions/meta-lead-ads-connect/index.ts` (162 LOC)

## Gatilho
- Chamada do frontend — conecta Meta Lead Ads (validação de token/páginas).

## Imports de `_shared/`
- `cors.ts`, `crypto.ts` (`encryptSecret`), `meta-graph.ts` (`metaGraphGet`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`, `admin_integrations`, `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (upsert credenciais cifradas)

## APIs externas
- Meta Graph API (validação inicial de token/páginas).

## Observações
- Estrutura idêntica a `meta-capi-connect` / `meta-whatsapp-connect` — replicação de padrão connect por sub-produto Meta.
