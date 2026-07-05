# twilio-whatsapp-setup

Path: `supabase/functions/twilio-whatsapp-setup/index.ts` (684 LOC)

## Gatilho
- Chamada do frontend — configuração inicial do Messaging Service Twilio, associação de números e sync inicial de templates.

## Imports de `_shared/`
- Nenhum direto detectado.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`
- `admin_integrations`
- `whatsapp_templates`

## Tabelas — ESCRITA
- `organization_integrations` (update)
- `whatsapp_templates` (insert/update)

## APIs externas (Twilio)
- `GET https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`
- `POST https://messaging.twilio.com/v1/Services`
- `GET/POST https://messaging.twilio.com/v1/Services/${sid}`
- `POST https://messaging.twilio.com/v1/Services/${sid}/PhoneNumbers`
- `GET https://content.twilio.com/v1/Content?PageSize=100`
- `POST https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`

## Observações
- Function fluxo-guiado (setup), fortemente acoplada à API Twilio Content. Boa candidata a extrair um cliente `twilio-content.ts` em `_shared/`.
