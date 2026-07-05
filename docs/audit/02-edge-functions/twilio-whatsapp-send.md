# twilio-whatsapp-send

Path: `supabase/functions/twilio-whatsapp-send/index.ts` (1037 LOC)

## Gatilho
- Chamada do frontend (`POST`) para envio outbound via Twilio WhatsApp.
- Também invocada indiretamente via `_shared/dispatch-whatsapp-send.ts` (usado por `scheduled-messages-cron`).

## Imports de `_shared/`
- Nenhum import direto de `_shared/*` detectado no topo (apenas `serve` e `createClient`). [INCERTO] — helpers replicados inline vs. `meta-whatsapp-send`.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`
- `message_threads`
- `communication_endpoints`
- `contacts`
- `whatsapp_templates`
- `users`

## Tabelas — ESCRITA
- `messages` (insert + status updates)
- `message_threads` (update — last_message_*, janela 24h)
- `activities` (insert)

## RPC
- `resolve_communication_endpoint`

## APIs externas
- Twilio Messaging API (`https://api.twilio.com/2010-04-01/Accounts/...`). [INCERTO] URL exata dentro do arquivo (não capturada no scan, mas há Basic Auth e Twilio Account/Auth Token embutidos em `organization_integrations`).

## Observações
- Espelho de `meta-whatsapp-send` com duplicação massiva da lógica de compliance/guards, resolução de endpoint e persistência.
- Sem `compliance_blocks` no scan → [INCERTO] se guards de bloqueio estão aplicados no caminho Twilio ou só no Meta.
