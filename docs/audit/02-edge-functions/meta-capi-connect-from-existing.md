# meta-capi-connect-from-existing

Path: `supabase/functions/meta-capi-connect-from-existing/index.ts` (165 LOC)

## Gatilho
- Chamada do frontend — conecta CAPI reaproveitando access token já armazenado em outra integração Meta da mesma org (WhatsApp Cloud, Lead Ads, etc).

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`, `encryptSecret`)
- `meta-graph.ts` (`metaGraphGet`, `MetaGraphError`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`
- `admin_integrations`
- `organization_integrations` (2 leituras — origem e destino)

## Tabelas — ESCRITA
- `organization_integrations` (upsert CAPI cifrado)

## APIs externas
- Meta Graph API.

## Observações
- Duplica ~80% de `meta-capi-connect`; diferença é só a origem do token. Bom alvo de consolidação.
