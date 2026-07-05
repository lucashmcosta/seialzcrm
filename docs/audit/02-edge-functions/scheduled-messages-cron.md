# scheduled-messages-cron

Path: `supabase/functions/scheduled-messages-cron/index.ts` (194 LOC)

## Gatilho
- Cron (executado periodicamente — [INCERTO] cadência exata; configuração de schedule fora do arquivo).
- Autenticada via `validateServiceRoleAuth` (`_shared/auth.ts`).

## Imports de `_shared/`
- `auth.ts` (`validateServiceRoleAuth`)
- `dispatch-whatsapp-send.ts` (`dispatchWhatsAppSend`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `scheduled_messages` (fila de mensagens agendadas)
- `integrations`

## Tabelas — ESCRITA
- `scheduled_messages` (update — status: sent/failed/processing)
- `contact_memories` (insert — [INCERTO] contexto: possivelmente memória de follow-up automatizado)
- `notifications` (insert — falhas/sucesso)

## APIs externas
- Nenhuma direta (delega ao dispatcher, que resolve Meta ou Twilio).

## Observações
- Bom exemplo de function pequena que reusa `_shared/dispatch-whatsapp-send.ts` — modelo que `meta-whatsapp-send` e `twilio-whatsapp-send` deveriam consumir para reduzir duplicação.
- Usada pela ferramenta `schedule_follow_up` do agente IA (ver `mem://features/ai-agent/scheduled-messages-tools`).
