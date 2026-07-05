# twilio-whatsapp-templates

Path: `supabase/functions/twilio-whatsapp-templates/index.ts` (609 LOC)

## Gatilho
- Chamada do frontend — CRUD de templates WhatsApp via Twilio Content API.
- Suporta `GET`, `POST` e `DELETE`.

## Imports de `_shared/`
- Nenhum direto detectado.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`
- `whatsapp_templates`

## Tabelas — ESCRITA
- `whatsapp_templates` (insert/update/delete)
- `organization_integrations` (update — [INCERTO] motivo)

## APIs externas
- `https://content.twilio.com/v1/Content` (list/create) + endpoints derivados para approvals/delete.

## Observações
- Complementar de `twilio-whatsapp-setup` — ambas manipulam Content API. Vale documentar fronteira.
