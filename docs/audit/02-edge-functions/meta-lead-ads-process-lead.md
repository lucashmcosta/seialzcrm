# meta-lead-ads-process-lead

Path: `supabase/functions/meta-lead-ads-process-lead/index.ts` (622 LOC)

## Gatilho
- Chamada por `meta-lead-ads-poll` (ou manual) para transformar 1 lead Meta em Contact + Opportunity + engajamento inicial.

## Imports de `_shared/`
- `cors.ts`, `notify.ts` (`notifyOrgUsers`), `auth.ts` (`validateServiceRoleAuth`), `dispatch-whatsapp-send.ts`

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organizations`, `contacts` (múltiplas — dedup), `lead_form_questions`, `lead_forms`, `whatsapp_templates`

## Tabelas — ESCRITA
- `contacts` (insert/update — várias)
- `custom_field_values` (insert)
- `tags` (insert/upsert), `tag_assignments` (insert)
- `opportunities` (insert/update)
- `activities` (insert)
- `contact_memories` (insert)

## RPC
- `assign_round_robin`

## APIs externas
- Nenhuma direta — envio WhatsApp via `dispatchWhatsAppSend`.

## Observações
- Function mais complexa deste bloco. Concentra: normalização, dedup, custom fields, tags, ownership round-robin, criação de opp, envio de template inicial.
- Duplica lógica de criação de contato/opp que também aparece em `lead-webhook`, `meta-whatsapp-webhook`, `twilio-whatsapp-webhook` — ver dívida técnica.
