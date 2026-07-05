# meta-discover-ad-accounts

Path: `supabase/functions/meta-discover-ad-accounts/index.ts` (240 LOC)

## Gatilho
- Chamada do frontend — lista Ad Accounts acessíveis com o token Meta da org (usado no wizard de Ads).

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)

## Env vars
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

## Tabelas — LEITURA
- `admin_integrations`
- `organization_integrations` (2 leituras)

## Tabelas — ESCRITA
- Nenhuma detectada (discovery, retorna JSON).

## RPC
- `get_meta_credentials`
- `get_internal_function_auth_token`

## APIs externas
- Meta Graph API `/me/adaccounts`.

## Observações
- Usa RPC `get_meta_credentials` para centralizar leitura/decrypt do token — bom padrão a espelhar em outras `meta-*`.
