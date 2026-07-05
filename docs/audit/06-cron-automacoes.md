# Cron e Automações

Fonte: `pg_cron` + `pg_net` (`net.http_post`), agendados via migrations em `supabase/migrations/`.

## Jobs registrados

| Job (jobname) | Cron | Alvo | Auth header | Timeout | Observações |
|---|---|---|---|---|---|
| `meta-lead-ads-poll` | `*/3 * * * *` | `meta-lead-ads-poll` | `Bearer <service_role>` (vault) | 120s | Poll de leads Meta. Lock via RPC. |
| `meta-lead-ads-token-health` | `0 8 * * *` | `meta-lead-ads-token-health` | `Bearer <service_role>` (vault) | 60s | Diagnóstico diário de token. |
| `integration-worker` | `30 seconds` | `integration-worker` | anon + `x-worker-token` (vault) | 25s | **⚠ anon key no header inline em migration** — funciona porque o edge function valida via `X-Worker-Token`, mas o padrão é ruim; deveria referenciar via variável. |
| `marketing-insights-sync-daily-cron` | `0 6 * * *` | `marketing-insights-sync-daily` | `Bearer <get_internal_function_auth_token()>` | 300s | Sync Meta Ads insights. |
| `meta-discover-ads-cron` | `30 5 * * *` | `meta-discover-ads-cron` | `Bearer <get_internal_function_auth_token()>` | 300s | Descoberta de ads. |
| `outbox-reaper` | `* * * * *` | RPC `fn_reap_stuck_jobs(5)` | — | — | SQL puro, sem HTTP. |
| `intelligence-ghosting-hourly` | `0 * * * *` | `intelligence-ghosting-detector` | `x-worker-token` (vault) | 30s | Detecção de ghosting. |
| `intelligence-rollup-daily` | `15 3 * * *` | `intelligence-rollup-cron` | `x-worker-token` (vault) | 60s | Agregações diárias. |
| `intelligence-retention-daily` | `30 4 * * *` | `intelligence-retention-cron` | `x-worker-token` (vault) | — | Purge de transcrições. |
| `intelligence-worker-30s` | `30 seconds` | `intelligence-worker` | `x-worker-token` inline (via `format(%L)`) | 25s | Worker de jobs de inteligência. |
| `intelligence-backfill-tick` | `*/2 * * * *` | RPC `trigger_intelligence_backfill(...)` | — | — | SQL puro. |
| `intelligence-reap-stale-jobs` | `*/5 * * * *` | RPC `intelligence_reap_stale_jobs(30, 5)` | — | — | SQL puro. |

Total de cron jobs registrados: **14** (algumas migrations reagendam o mesmo job).

## Jobs mencionados como cron nas fichas mas não visíveis nas migrations analisadas

- `scheduled-messages-cron` — mensagens agendadas via `scheduled_messages`. [INCERTO] agendamento pode estar em outra migration ou registrado manualmente.
- `meta-capi-retry-cron` — retry de CAPI. [INCERTO] mesmo caso.

## Padrões de autenticação (por criticidade)

1. **Vault + `service_role`** (`meta-lead-ads-*`) — service role em `vault.decrypted_secrets`. Máximo privilégio; edge function não precisa validar caller.
2. **Vault + `x-worker-token`** (`intelligence-*`, `integration-worker`) — token custom guardado no vault. Edge function valida via `INTELLIGENCE_WORKER_TOKEN` / equivalente. **Bom padrão.**
3. **`get_internal_function_auth_token()`** (`marketing-*`, `meta-discover-*`) — RPC SECURITY DEFINER retorna token; edge function valida via `validateServiceRoleAuth` ou equivalente. **Bom padrão, centralizado.**
4. **Anon key inline em migration** (`integration-worker`) — anon key colada literalmente no CRON SQL. Funciona porque o Worker Token é a defesa real, mas se a anon key for rotacionada, o cron quebra até re-executar a migration. **Recomendação:** migrar para padrão 3.

## Automações SQL (triggers)

Não coberto exaustivamente aqui — presentes em toda a base:

- `messages` → atualiza `message_threads.last_message_*` (memory `messages/performance-denormalization-strategy`).
- `contacts`/`opportunities` → propaga soft-delete (memory `features/opportunities/soft-delete-propagation`).
- Railway external sync (memory `features/ai-agent/railway-external-sync-trigger`).
- Denormalization triggers em `communication_endpoints_purpose_audit`.

## Recomendações

1. Consolidar toda autenticação de cron em `get_internal_function_auth_token()` — remover anon key inline em `integration-worker`.
2. Documentar oficialmente `scheduled-messages-cron` e `meta-capi-retry-cron` (verificar se realmente existem como cron ou como HTTP triggers externos).
3. Adicionar telemetria (Sentry) em todas as funções invocadas por cron — hoje falhas são silenciosas fora dos logs.
4. Considerar reduzir frequência de `integration-worker`/`intelligence-worker` (`30 seconds`) em janelas ociosas via feature-flag; ambos consomem RPC calls contínuas.
