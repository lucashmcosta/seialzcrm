# meta-ads-manager-save

Path: `supabase/functions/meta-ads-manager-save/index.ts` (180 LOC)

## Gatilho
- Chamada do frontend — persiste credenciais/config de Ads Manager (Meta Business) da organização.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`encryptSecret`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (upsert com token cifrado)

## RPC
- `get_internal_function_auth_token`

## APIs externas
- Nenhuma direta (persiste; discovery ocorre em `meta-discover-ad-accounts`).

## Observações
- Usa RPC `get_internal_function_auth_token` — [INCERTO] serve para autorizar chamadas internas function-to-function.
