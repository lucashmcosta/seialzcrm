# Operations

Leitura obrigatória para qualquer pessoa (ou agente) que altere o sistema.

## A Regra do Drift (inegociável)

**Toda mudança manual no banco de produção (SQL Editor, dashboard) exige a migration correspondente commitada no repo NO MESMO DIA. Deploy de edge function só via repo — nunca pelo dashboard.**

Motivo documentado: em 2026-07 o banco tinha 184 migrations aplicadas vs 261 no repo, 3 functions de produção fora do Git e 8 tabelas de backfill órfãs (ver [`drift/2026-07-04.md`](drift/2026-07-04.md)).

### Corolários
- Backfill/backup temporário: criar em schema `_scratch`, nunca em `public`, com data no nome e prazo de expurgo.
- Alterou schema/trigger/RPC → regenerar `docs/reference/database/database-full.md` e `trigger-functions.sql` no mesmo PR (queries de regeneração no rodapé dos arquivos).

Ver ADR [`decisions/0007-drift-rule.md`](../decisions/0007-drift-rule.md).

## Processos agendados (pg_cron — 15 jobs)

| Frequência | Job | Alvo |
|---|---|---|
| 30s | `integration-worker` | edge fn `integration-worker` (outbox → destinos) |
| 30s | `intelligence-worker-30s` | edge fn `intelligence-worker` (fila de IA) |
| 1min | `outbox-reaper` | `fn_reap_stuck_jobs(5)` |
| 2min | `intelligence-backfill-tick` | retoma backfill runs ativas |
| 3min | `meta-lead-ads-poll` | poll de leads Meta |
| 5min | `meta-capi-retry-cron` | retry de eventos CAPI falhos |
| 5min | `intelligence-reap-stale-jobs` | reclaim de jobs de IA presos |
| 1h | `intelligence-ghosting-hourly` | detector de ghosting |
| Diário 03:00 | `integration-inbound-events-cleanup` | expurgo de inbound processado/expirado |
| Diário 03:15 | `intelligence-rollup-daily` | rollups de métricas |
| Diário 04:30 | `intelligence-retention-daily` | retenção/expurgo intelligence |
| Diário 05:30 | `meta-discover-ads-cron` | descoberta de ads |
| Diário 06:00 | `marketing-insights-sync-daily-cron` | sync de insights Meta |
| Diário 08:00 | `meta-lead-ads-token-health` | saúde de tokens Meta |
| 6h | `marketing-campaign-enrich-cron` | enrich de campanhas ⚠️ fn fora do repo (drift #2) |

⚠️ `scheduled-messages-cron` deployada sem cron — drift #3.

## Arquitetura de filas (1 parágrafo cada)

**Outbox (Seialz → mundo):** triggers em `contacts` / `opportunities` / `messages` publicam em `integration_events` (com `idempotency_key`) → `fn_fanout_event` cria `integration_jobs` por subscription ativa → `integration-worker` (30s) processa com claim atômico (`rpc_claim_integration_jobs`) → reaper solta presos. Saúde: `fn_outbox_health_summary()`, edge fn `outbox-health`, heartbeat em `outbox_system_heartbeats`.

**Inbound (mundo → Seialz):** webhooks gravam raw em `integration_inbound_events` → `integration-inbound-dispatcher` roteia por handler → claims com TTL (`rpc_claim_inbound_events`), retry classificado, dead letter em `integration_inbound_dead_letter_archive`, erros de ingest em `integration_inbound_ingest_errors`. Cleanup diário 03:00. Saúde: `fn_inbound_health_summary()`.

**Intelligence:** trigger BEFORE INSERT em `messages` enfileira `intelligence_jobs` (transcribe p/ áudio, analyze p/ texto, idempotente) → worker 30s → resultados em `message_analyses` (validadores por trigger), rollups diários, ghosting horário.

**CAPI:** triggers em `contacts` (Lead) e `opportunities` won (Purchase) → `fn_capi_dispatch_event` → `capi_event_log` → envio + retry 5 min.

## Runbook — sintomas e primeiro diagnóstico

| Sintoma | Primeiro passo |
|---|---|
| Inbox não recebe mensagens novas | `fn_inbound_health_summary('1 hour')`; checar `integration_inbound_ingest_errors` recentes; logs da edge fn do webhook do provider |
| Eventos não chegam ao Nammux/Kommo | `fn_outbox_health_summary()`; `fn_outbox_dlq_by_integration()`; verificar subscription ativa em `integration_subscriptions` |
| CAPI sem eventos no Events Manager | `capi_event_log` por status; `meta-capi-retry-cron` logs; token via `meta-lead-ads-token-health` |
| Leads Meta não entram | `meta-lead-ads-poll` logs; `try_lead_form_polling_lock` preso; `lead_forms.is_mapping_configured` |
| IA não responde / não analisa | `intelligence_jobs` por status; `intelligence_stale_claims_metrics`; `ai_usage_logs` para erro de provider/BYOK |
| Atribuição de dono estranha | `round_robin_scope` da org; `deal_assignment_log` / `thread_assignment_history`; triggers de round-robin (3 frentes) |
| Banco lento | `pg_stat_statements`; conexões (incidente histórico: exaustão em Micro→Small); tamanho de `audit_logs` / `notifications` / `activities` |
| Token Meta expirado | `meta-lead-ads-token-health` dispara `admin_notifications` diariamente 08:00 UTC → `/settings/integrations` reconectar |
| Rollback Kommo | `kommo-rollback` reverte via `import_logs` (40 col) — não apaga `contacts`/`opportunities` diretamente |
| WhatsApp Twilio HMAC inválida | Verificar `Auth Token` em `organization_integrations` (Twilio pode ter rotacionado) |

## Janelas e cuidados

- Workers de 30s significam: **nunca** rodar migration pesada em `integration_jobs` / `intelligence_jobs` sem pausar os crons (`select cron.unschedule(...)` e reagendar depois).
- `messages` tem 12 triggers: INSERT em massa (imports, backfills) deve usar `SET session_replication_role = replica` com MUITO critério (desliga TODAS as triggers, inclusive as de evento) — ou inserir em lotes pequenos.
- `fn_publish_integration_event` respeita `SET LOCAL app.skip_event_emit = 'true'` para imports que não devem ecoar eventos.

## Health checks
- Frontend: `/health`, `/dev/health`.
- Edge fn: `health`, `outbox-health` (wrapper de `fn_outbox_health_summary_internal`).

## Referências
- Drift ativo: [`drift/2026-07-04.md`](drift/2026-07-04.md)
- Conflitos descoberta vs repo: [`conflicts.md`](conflicts.md)
- Dívida técnica completa: [`../audit/07-divida-tecnica.md`](../audit/07-divida-tecnica.md)
- Cron detalhado: [`../audit/06-cron-automacoes.md`](../audit/06-cron-automacoes.md)
