# Meta Lead Ads

## Fluxo

- **Conexão:** `meta-lead-ads-connect` — Meta Graph, escreve `organization_integrations`.
- **Descoberta:** `meta-lead-ads-discover` — pages/forms/questions → `meta_lead_pages`, `lead_forms`, `lead_form_questions`.
- **Polling:** `meta-lead-ads-poll` (cron `*/3 * * * *`) — busca novos leads, lock via RPC `try_lead_form_polling_lock`, delega processamento.
- **Processamento:** `meta-lead-ads-process-lead` (622 LOC) — transforma lead → Contact + Opportunity + Activity + Tags, dedup, round-robin, `dispatchWhatsAppSend`.
- **Saúde do token:** `meta-lead-ads-token-health` (cron `0 8 * * *`).
- **One-shots Viagi:** `meta-lead-ads-backfill-viagi`, `meta-lead-ads-recovery-viagi`, `meta-lead-ads-viagi-token-probe`.

## Env vars

`META_APP_SECRET`, `META_GRAPH_VERSION`.

## Tabelas

`meta_lead_pages`, `lead_forms`, `lead_form_questions`, `contacts`, `opportunities`, `activities`, `tag_assignments`, `organization_integrations`.

## UI

`src/components/integrations/meta-lead-ads/` — Connect, MappingDrawer, PagesAndFormsList, QuestionMappingCard, SettingsCard, StatusDashboard.

## Observações

- Duplicação de lógica de criação de lead vs `lead-webhook` e `meta-whatsapp-webhook` — memory `leads/webhook-duplicate-prevention-logic` unifica modos de dedup.
- Round-robin: RPC `assign_round_robin` (memory `features/crm/record-assignment-system`).
- 9º dígito BR: memory `contacts/brazilian-9th-digit-normalization`.
