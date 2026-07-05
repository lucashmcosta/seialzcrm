# ADR 0006 — Idempotência obrigatória em publicação de eventos

**Status:** Aceito (em produção).
**Evidência:** `fn_publish_integration_event` no banco vivo, coluna `idempotency_key` em `integration_events`, cláusula `ON CONFLICT DO NOTHING`.

## Contexto
Triggers em `contacts`, `opportunities`, `messages` publicam eventos em `integration_events` que são fanned-out para `integration_jobs` por subscription. Sem idempotência, retries e re-execuções gerariam entregas duplicadas para Kommo/Nammux/CAPI/…

## Decisão
- Todo trigger/RPC que publica em `integration_events` computa um `idempotency_key` determinístico.
- Inserção usa `ON CONFLICT (idempotency_key) DO NOTHING`.
- Imports em massa que não devem ecoar eventos: `SET LOCAL app.skip_event_emit = 'true'` na transação. `fn_publish_integration_event` respeita a flag.

## Consequências
- Nunca duplica evento outbound.
- Backfills e replays podem ser reexecutados com segurança.
- Regra vira convenção obrigatória para qualquer nova fonte de evento.
