# meta-whatsapp-templates-create

Path: `supabase/functions/meta-whatsapp-templates-create/index.ts` (214 LOC)

## Gatilho
- Chamada do frontend (`POST`) — cria template WhatsApp na WABA e persiste localmente.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)
- `meta-whatsapp/graph.ts` (`metaWaPostJson`, `MetaWaGraphError`)
- `meta-whatsapp/credentials.ts` (`resolveAppSecretForIntegration`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`

## Tabelas — ESCRITA
- `whatsapp_templates` (insert)

## APIs externas
- Meta Graph API `POST /{waba_id}/message_templates`.

## Observações
- Sem tratamento explícito de retry para status intermediários da Meta (PENDING → APPROVED/REJECTED); sync fica a cargo de `meta-whatsapp-templates-sync`.
