# Modelo de dados — Contatos

| Tabela | Linhas (2026-07-04) | Papel |
|---|---|---|
| `contacts` | 24.960 | Entidade principal (61 col) |
| `contacts_merge_log` | 228 | Auditoria de unificações |
| `contact_memories` | 5.442 | Memória de longo prazo (agente IA) |
| `companies` | 10 | Pessoa jurídica |
| `tags` | 1.604 | Etiquetas |
| `tag_assignments` | 4.174 | Vínculo contato↔tag |
| `custom_field_definitions` | 29 | Definições |
| `custom_field_values` | 0 | Valores |
| `activities` | 403.856 | Histórico (transversal) |
| `notifications` | 328.705 | Notificações (transversal) |
| `audit_logs` | 292.321 (**463 MB**) | ⚠️ Duplicado por drift P0 #1 |
| `backup_meta_backfill_2026_05_28_contacts` | 0 | ⚠️ Backup órfão (drift #6) |

## Triggers em `contacts` (11)

- `contacts_round_robin` (BEFORE INS), `contacts_round_robin_audit` (AFTER INS).
- `trg_capi_lead_on_contact_insert/update` → `fn_capi_trigger_lead_on_contact`.
- `trg_contacts_normalize_phone` (BEFORE INS/UPD) → `contacts_set_phone_normalized`.
- `trg_populate_contact_marketing_campaign_fk` (BEFORE INS/UPD).
- `trg_publish_event_contacts` (AFTER INS/UPD) → `fn_publish_integration_event` (outbox).
- `update_contacts_updated_at` (BEFORE UPD).
- ⚠️ **Auditoria duplicada** (drift P0 #1): `audit_contacts_delete/insert/update` **+** `contacts_audit_trigger` combinada → cada operação grava em dobro em `audit_logs`.

## RLS
Padrão `organization_id = ANY(current_user_org_ids())` — 5 policies.

## RPCs
- `rpc_search_contacts(p_organization_id, p_search, p_owner_user_id, p_lifecycle_stage, p_created_from, ...)`.
- `normalize_phone_br(phone_input)`.

## Hooks
- `src/hooks/contacts/useContactConversationsByContext.ts`.
- `src/hooks/documents/useContactDocuments.ts`.
