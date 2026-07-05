# twilio-setup

Path: `supabase/functions/twilio-setup/index.ts` (208 LOC)

## Gatilho
- Chamada do frontend — configuração de conta Twilio Voice para a organização (ativa credenciais, descobre números).

## Imports de `_shared/`
- Nenhum direto.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `admin_integrations`
- `organization_integrations`

## Tabelas — ESCRITA
- `organization_integrations` (upsert de credenciais)
- `organization_phone_numbers` (insert dos números descobertos)

## APIs externas
- [INCERTO] scan não capturou fetch de `api.twilio.com` mas o propósito indica leitura de `IncomingPhoneNumbers.json`.

## Observações
- Análogo a `twilio-whatsapp-setup`, mas para Voice. Ambos poderiam compartilhar um cliente `_shared/twilio-rest.ts`.
