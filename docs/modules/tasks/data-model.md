# Modelo de dados — Tarefas

| Tabela | Linhas (2026-07-04) | Papel |
|---|---|---|
| `tasks` | 1.322 | Tarefa (23 col — título, tipo, due_at, owner, contact_id/opportunity_id) |
| `scheduled_messages` | 3 | ⚠️ Function deployada sem cron (drift #3) |

## Triggers em `tasks` (7)
- `task_activity_trigger` (AFTER INS) → `create_task_activity`.
- `task_assigned_notification` (AFTER INS/UPD) → `notify_task_assigned`.
- `update_tasks_updated_at`.
- ⚠️ **Auditoria duplicada** (drift P0 #1): `audit_tasks_delete/insert/update` **+** `tasks_audit_trigger` combinada.

RLS padrão. 3 policies em `tasks`, 5 em `scheduled_messages`.
