# meta-whatsapp-templates-sync

Path: `supabase/functions/meta-whatsapp-templates-sync/index.ts` (220 LOC)

## Gatilho
- Chamada do frontend (`POST`) — sincroniza templates da WABA para o banco local.
- [INCERTO] se também é executada por cron; não encontrado agendamento no código.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)
- `meta-whatsapp/graph.ts` (`metaWaGet`, `MetaWaGraphError`)
- `meta-whatsapp/credentials.ts` (`resolveAppSecretForIntegration`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`
- `whatsapp_templates`

## Tabelas — ESCRITA
- `whatsapp_templates` (upsert + delete de removidos)

## APIs externas
- Meta Graph API `GET /{waba_id}/message_templates`.

## Observações
- Faz reconciliação (compara conjunto remoto x local e apaga faltantes) — cuidado com deleção em massa se a Graph retornar página parcial. [INCERTO] se há paginação completa.
