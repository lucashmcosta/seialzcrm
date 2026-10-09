# ADR 0011 — Rodízio do Atendimento separado do Comercial

**Status:** Aceito (2026-10-09).

## Decisão
- Conversas `business_context = 'customer_service'` nunca chamam `assign_round_robin`; `trg_threads_round_robin` sai cedo para elas (contexto derivado do endpoint na inserção via `fn_thread_context_preview`).
- Atribuição do Atendimento por `trg_zy_cs_assignment` (BEFORE INSERT), `trg_cs_assignment_log` (AFTER INSERT, histórico) e ramo próprio em `trg_messages_smart_reopen`.
- Toda lógica nova roda em bloco com EXCEPTION: erro → conversa sem responsável + `cs_routing_errors`. Nunca bloqueia ingestão.
- Fila própria (`cs_round_robin_members`), sem tocar em `user_organizations.round_robin_*`.

## Consequências
Comercial inalterado; Atendimento só vai para quem tem acesso; rollback em `docs/platform/security/rbac-v2/rollback/cs-rr-*.sql`.
