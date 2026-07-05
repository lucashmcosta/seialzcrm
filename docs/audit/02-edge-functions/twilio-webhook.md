# twilio-webhook

Path: `supabase/functions/twilio-webhook/index.ts` (585 LOC)

## Gatilho
- Webhook externo Twilio — eventos de **voz** (call status, recording callbacks). Distinto de `twilio-whatsapp-webhook`.

## Imports de `_shared/`
- Nenhum direto.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_phone_numbers`
- `user_organizations`
- `contacts`
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- `contacts` (insert/update em inbound desconhecido)
- `calls` (insert/update — status, duração)
- `call_recordings` (insert)

## APIs externas
- Twilio (leitura de recording metadata via URLs recebidas). [INCERTO]

## Observações
- Isolamento por integração ativa (ver `mem://integrations/twilio-voice-security-isolation`).
- Rotina de auto-criação de contato em inbound sobrepõe com lógica dos webhooks WhatsApp — duplicação.
