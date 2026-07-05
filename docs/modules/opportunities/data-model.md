# Modelo de dados — Oportunidades

| Tabela | Linhas (2026-07-04) | Papel |
|---|---|---|
| `opportunities` | 18.038 | Deal (29 col — contact_id, stage_id, value, status, owner) |
| `opportunity_behavior_snapshot` | 11.297 | Snapshot de comportamento (28 col) |
| `pipeline_stages` | 57 | Etapas do pipeline |
| `opportunities_status_backup_20260512` | 1.559 | ⚠️ Backup one-shot ainda em `public` (drift #6) |
| `sales_events` | 19.045 | Eventos comerciais associados |
| `products` | 5 | Catálogo |

## Triggers em `opportunities` (12+)

- `opportunities_round_robin` (BEFORE INS).
- `opportunity_stage_change_trigger` → `create_stage_change_activity`.
- `opportunity_won_notification` → `notify_opportunity_won`.
- `trg_capi_purchase_on_opp_won` → `fn_capi_trigger_purchase_on_opp`.
- `trg_emit_opportunity_won` → `fn_emit_opportunity_won_event`.
- `trg_opportunity_won_promote_contact` → `fn_opportunity_won_promote_contact`.
- `trg_opps_finalize_snapshot` → `fn_opps_finalize_snapshot`.
- `trg_publish_event_opportunities` → `fn_publish_integration_event` (outbox).
- `trg_sync_opportunity_status_from_stage` (BEFORE INS/UPD).
- `update_opportunities_updated_at`.
- ⚠️ **Auditoria duplicada** (drift P0 #1): `audit_opportunities_delete/insert/update` **+** `opportunities_audit_trigger` combinada.

## RLS
Padrão `organization_id = ANY(current_user_org_ids())`, 4 policies.

## Edge functions relacionadas
- `fix-orphan-opportunities`, `nammux-replay-opportunity`.

## RPCs
- `get_opportunities_by_stage(p_organization_id, p_limit_per_stage)` — ⚠️ 2 overloads.
- `get_opportunity_stage_counts(org_id)`.
- `fn_build_opportunity_won_payload(_opportunity_id)`.
