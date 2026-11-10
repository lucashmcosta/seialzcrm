# Modelo de dados — Oportunidades

| Tabela | Linhas (2026-07-04) | Papel |
|---|---|---|
| `opportunities` | 18.038 | Deal (29 col — contact_id, stage_id, value, status, owner) |
| `opportunity_behavior_snapshot` | 11.297 | Snapshot de comportamento (28 col) |
| `pipeline_stages` | 57 | Etapas do pipeline |
| `opportunities_status_backup_20260512` | 1.559 | ⚠️ Backup one-shot ainda em `public` (drift #6) |
| `sales_events` | 19.045 | Eventos comerciais associados |
| `products` | 5 | Catálogo |
| `opportunity_loss_reasons` | 0 (2026-11-10) | Motivo de perda (código gerado A, B…) — [ADR-0013](../../decisions/0013-loss-reasons.md) |
| `opportunity_loss_reason_details` | 0 (2026-11-10) | Detalhe do motivo (código A1…; exige descrição; só automação) |
| `opportunity_loss_settings` | 0 (2026-11-10) | Regras gerais por org (sem linha = padrão) |
| `opportunity_losses` | 1 (2026-11-10) | Histórico append-only de perdas (autor, etapa anterior, reabertura) |
| `opportunity_loss_corrections` | 0 (2026-11-10) | Correções de motivo com valor anterior |
| `opportunity_loss_stage_rules` | 0 (2026-11-10) | Regra por etapa (detalhe gravado pela automação) |
| `opportunity_loss_code_counters` | 0 (2026-11-10) | Contadores de código (só sobem; só funções) |

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
- `trg_guard_opportunity_lost_v1` (AFTER UPD) → `fn_guard_opportunity_lost_v1`: trava perda sem motivo e grava `opportunity_losses` (ADR-0013).
- `trg_close_open_loss_on_reopen_v1` (AFTER UPD) → fecha a perda em aberto ao sair de Perdida.
- `trg_z_opportunities_result_timestamps` → `fn_opportunities_result_timestamps` (grava `won_at/lost_at` e `*_source`). ⚠️ Sem migration no repo — [drift 2026-11-10](../../operations/drift/2026-11-10.md).
- ⚠️ **Auditoria duplicada** (drift P0 #1): `audit_opportunities_delete/insert/update` **+** `opportunities_audit_trigger` combinada.

## RLS
Padrão `organization_id = ANY(current_user_org_ids())`, 4 policies.

## Edge functions relacionadas
- `fix-orphan-opportunities`, `nammux-replay-opportunity`.

## RPCs
- `get_opportunities_by_stage(p_organization_id, p_limit_per_stage)` — ⚠️ 2 overloads.
- `get_opportunity_stage_counts(org_id)`.
- `fn_build_opportunity_won_payload(_opportunity_id)`.

## RPCs de perda (ADR-0013)

`mark_opportunity_lost_v1`, `mark_opportunities_lost_batch_v1`, `reopen_opportunity_v1`, `correct_opportunity_loss_v1`, `list_loss_reason_options_v1`, `loss_reason_usage_v1`, `list_loss_stage_rule_issues_v1`. Internas (service_role): `fn_mark_opportunity_lost_internal_v1`, `fn_resolve_loss_choice_v1`, `loss_stage_rule_detail_v1`. Telas: `src/components/settings/loss-reasons/`, `src/components/opportunities/loss/`.
