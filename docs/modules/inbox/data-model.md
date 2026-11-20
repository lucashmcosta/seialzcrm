# Modelo de dados — Inbox v2

Reutiliza `message_threads` / `messages`. Fase 0 documentada em `docs/inbox-v2/`:
- `01_phase0_a_schema.sql`
- `02_phase0_b_indexes.sql`
- `03_phase0_c_functions.sql`
- `99_phase0_ROLLBACK.sql`
- `validation_queries.sql`
- `phase1_webhook_patch.md`, `P1_template_bulk_thread_reuse.md`

## Agente de IA na conversa

- `message_threads.ai_agent_paused_until` (timestamptz): a equipe pausou o agente nesta conversa até esta data (botão "Pausar agente" no cabeçalho da conversa: 2 h, 24 h ou "até reativar", que grava 01/01/2100). `ai-agent-respond` não responde enquanto a data não passar (`paused_by_team`). Migration `20261120220000_thread_agent_pause.sql`.
- `last_routing_decision` com `action = 'agent_handoff'` traz `area`, `urgent` e `agent_name` da passagem (ver `docs/modules/ai-agent/README.md`).
