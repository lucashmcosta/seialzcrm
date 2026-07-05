# Platform — Observability

**Fonte:** `docs/audit/07-divida-tecnica.md`, `docs/audit/06-cron-automacoes.md`.

## Frontend
- Sentry (`@sentry/react` + `@sentry/vite-plugin`) via `src/instrument.ts`.
- Source maps enviados no build.

## Backend / Edge functions
- 🔴 **Sem Sentry na maioria das 90 functions.** Só `health` lê `SENTRY_DSN`.
- Logs disponíveis via Supabase Dashboard → Edge Function logs.

## Auditoria em banco
| Tabela | Escopo |
|---|---|
| `audit_logs` | Geral |
| `admin_audit_logs` | Ações admin/impersonação |
| `integration_audit_logs` | Integrações |
| `intelligence_settings_audit` | Config intelligence |
| `communication_endpoints_purpose_audit` | Mudanças de propósito de endpoint |
| `import_logs` | Migração Kommo (com rollback) |
| `capi_event_log` | Meta CAPI (retry) |
| `message_thread_merge_audit` | Merges de threads |

## Cron sem alerta
Cron falho só aparece em `cron.job_run_details`. Dívida 🟡: configurar `outbox-health` / `cron-health` reportando para Sentry ou `admin_notifications`.

## Métricas
- `organization_usage_metrics` — uso por org.
- `seller_metrics_daily` — vendedor.
- `ai_usage_logs` — custo LLM.
- `outbox_system_heartbeats` — heartbeat de outbox.

## Recomendações
1. Instrumentar Sentry nas 6+ functions críticas (ver dívida técnica).
2. Alerta para falhas de cron.
3. Dashboard operacional em `/obs`.
