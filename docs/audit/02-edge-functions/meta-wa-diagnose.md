# meta-wa-diagnose

Path: `supabase/functions/meta-wa-diagnose/index.ts` (158 LOC)

## Gatilho
- Chamada do frontend (`POST`) — diagnóstico ad-hoc de credenciais/número WhatsApp Cloud.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)
- `meta-whatsapp/graph.ts` (`metaWaGet`, `MetaWaGraphError`)
- `meta-whatsapp/credentials.ts` (`resolveAppSecretForIntegration`)

## Env vars
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

## Tabelas — LEITURA
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- Nenhuma detectada (apenas leitura + chamadas Graph, retorna JSON de diagnóstico).

## APIs externas
- Meta Graph API — leitura de `phone_numbers`, `message_templates`, `business_profile`.

## Observações
- Sobreposição de responsabilidades com `meta-whatsapp-verify`. Este é read-only (diagnóstico) e o outro persiste status. Vale consolidar. [INCERTO]
