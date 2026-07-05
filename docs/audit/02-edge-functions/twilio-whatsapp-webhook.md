# twilio-whatsapp-webhook

Path: `supabase/functions/twilio-whatsapp-webhook/index.ts` (~1160 LOC)

## Gatilho
- Webhook externo do **Twilio** (WhatsApp via Messaging Service / Business API).
- Recebe eventos: mensagens inbound + status callbacks (delivered/read/failed).

## Imports de `_shared/`
- Nenhum import explícito de `_shared/*` detectado no topo; utiliza `createClient` do Supabase e lógica local. [INCERTO] se há helper indireto.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_WEBHOOK_PUBLIC_BASE_URL`
- `TWILIO_SIGNATURE_ENFORCE`

## Tabelas — LEITURA
- `organization_integrations`
- `communication_endpoints`
- `pipeline_stages`
- `ai_agents`

## Tabelas — ESCRITA
- `integration_inbound_events` (insert — pipeline novo)
- `contacts` (insert/update)
- `opportunities` (insert)
- `message_threads` (insert/update)
- `messages` (insert)
- `notifications` (insert)
- `activities` (insert)

## RPC chamadas
- `resolve_communication_endpoint`

## APIs externas
- Nenhuma (recebe do Twilio; não faz outbound aqui).

## Chamadas para outras functions
- `POST ${SUPABASE_URL}/functions/v1/ai-agent-respond`.

## Observações
- Espelho quase 1:1 de `meta-whatsapp-webhook` — duas implementações paralelas por provider. Forte candidato a extrair um "ingest core" compartilhado.
- Validação de assinatura Twilio controlada por env var `TWILIO_SIGNATURE_ENFORCE` (permite bypass — [INCERTO] em quais ambientes).
- Escreve tanto no pipeline novo (`integration_inbound_events`) quanto direto nas tabelas de mensagens (caminho antigo).
