## Validação final de produção da Outbox

Executar os 5 testes e entregar resultados reais. Ao final, remover totalmente o handler de teste e redeployar o worker sem ele.

### 1. Handler de teste temporário
- Criar `supabase/functions/_shared/integration-handlers/test-outbox.ts` com 3 modos via `payload.mode`: `success` → `Classification.Success`, `retryable` → `Classification.Retryable` ('simulated retryable'), `permanent` → `Classification.Permanent` ('simulated permanent').
- Registrar `test-outbox:run` em `registry.ts`.
- Deploy do `integration-worker`.

### 2. Seed controlado
- 1 `integration_subscriptions` (slug `test-outbox`, `event_type='test-outbox.run'`, `target_action='run'`, `is_active=true`) em uma organização existente.
- 3 `integration_events` + 3 `integration_jobs` (mode = success / retryable / permanent), `status='pending'`, `max_attempts=3`, `next_run_at=now()`.

### 3. Executar worker e validar
Disparar `integration-worker` via `curl_edge_functions` com `x-worker-token` até processar os 3. Por job, validar status, `next_run_at`, `last_error`, audit `worker.{classification}` em `integration_audit_logs`, e que nenhum ficou `running`.

### 4. Reaper
- INSERT direto de job `running` com `started_at = now() - interval '10 min'`.
- Chamar `fn_reap_stuck_jobs(5)` (sem esperar cron).
- Validar:
  - job → `failed`, `next_run_at` futuro, `last_error LIKE 'reaped:%'`
  - **Heartbeat em `outbox_system_heartbeats` com `component = 'reaper'` e `last_run_at` recente**
  - `running_stuck_5m = 0` em `fn_outbox_health_summary_internal()`

### 5. Tela admin `/admin/integration-health`
- Abrir no browser sandbox como admin, capturar screenshot, confirmar carregamento sem erro.
- Disparar Retry / Dismiss em jobs de teste e Pause / Resume na subscription; confirmar efeito via SQL.
- Validar RLS chamando `fn_outbox_health_summary()` / `fn_outbox_retry_job(...)` sem auth → esperado `42501 permission denied`.

### 6. Cleanup obrigatório
- DELETE dos jobs/events/subscription de teste (e job do reaper).
- **Remover totalmente o handler de teste do código**:
  - Deletar `supabase/functions/_shared/integration-handlers/test-outbox.ts`.
  - Remover import e `register("test-outbox", "run", ...)` em `registry.ts`.
- **Redeploy do `integration-worker`** sem o handler.
- Confirmar via SQL: `SELECT count(*) FROM integration_subscriptions WHERE integration_slug='test-outbox'` e mesma checagem em `integration_jobs` e `integration_events` → todos `0`.

### Entrega
Tabela consolidada (testes 1–5) com SIM/NÃO + valores observados, screenshot da tela admin, confirmação do cleanup. **Nenhum passo de Nammux nesta etapa.**
