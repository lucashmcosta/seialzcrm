# Modelo de dados — Tarefas

| Tabela | Papel |
|---|---|
| `tasks` | 23 colunas — título, tipo, due_at, owner, contact_id/opportunity_id |
| `scheduled_messages` | Mensagens agendadas (usadas pela tool `schedule_follow_up`) |

RLS padrão. 3 políticas em `tasks`, 5 em `scheduled_messages`.
