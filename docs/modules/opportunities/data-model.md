# Modelo de dados — Oportunidades

| Tabela | Papel |
|---|---|
| `opportunities` | 29 colunas — deal (contact_id, stage_id, value, status, owner) |
| `pipeline_stages` | Etapas do pipeline (7 col) |
| `opportunity_behavior_snapshot` | Snapshot de comportamento (28 col) |
| `opportunities_status_backup_20260512` | Backup one-shot (candidato a arquivamento) |
| `sales_events` | Eventos comerciais associados |

RLS: `organization_id = ANY(current_user_org_ids())`, 4 políticas.

Edge functions relacionadas: `fix-orphan-opportunities`, `nammux-replay-opportunity`.
