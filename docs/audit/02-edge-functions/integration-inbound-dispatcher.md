# integration-inbound-dispatcher

Path: `supabase/functions/integration-inbound-dispatcher/index.ts` (518 LOC)

## Gatilho
- Chamada `POST` (frontend/cron interno). Consome `integration_inbound_events` em modo claim/lease (worker loop).
- [INCERTO] se é acionada por cron ou por trigger de banco.

## Imports
- `jsr:@supabase/supabase-js@2` (padrão novo)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `integration_inbound_events` (fila de eventos)
- `integration_inbound_event_claims`
- `integration_inbound_dry_run_log`

## Tabelas — ESCRITA
- `integration_inbound_event_claims` (insert/update — claim)
- `integration_inbound_dry_run_log` (insert)
- `messages` (insert — quando processa evento de mensagem)

## APIs externas
- Nenhuma direta.

## Observações
- Pipeline "novo" de ingest — desacopla webhooks (que só empurram para `integration_inbound_events`) do processamento. Coexiste com o caminho legado que escreve direto (ver `meta-whatsapp-webhook` e `twilio-whatsapp-webhook`).
- Suporta modo dry-run (`integration_inbound_dry_run_log`).
