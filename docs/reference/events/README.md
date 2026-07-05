# Reference — Eventos

Catálogo dos eventos que o Seialz **consome** (webhooks/fila inbound) e **emite** (outbox/CAPI/realtime). Snapshot: **2026-07-05**, com contagens do banco vivo. Schemas de payload ainda não extraídos — `[TODO]`.

## 1. Outbox — eventos emitidos (`integration_events`)

Publicados por triggers (`fn_publish_integration_event`, `fn_emit_opportunity_won_event`) com `idempotency_key` ([ADR-0006](../../decisions/0006-event-idempotency.md)); `fn_fanout_event` cria `integration_jobs` por subscription ativa; `integration-worker` entrega (handlers em `_shared/integration-handlers/`, registry `{integration_slug}:{target_action}`).

| event_type | Origem (trigger) | Volume em prod (2026-07-05) |
|---|---|---|
| `message.outbound_sent` | INSERT em `messages` (outbound) | 64.535 |
| `opportunity.updated` | UPDATE em `opportunities` | 25.274 |
| `opportunity.stage_changed` | UPDATE de etapa | 19.155 |
| `opportunity.created` | INSERT em `opportunities` | 10.454 |
| `contact.created` | INSERT em `contacts` | 10.122 |
| `opportunity.won` | won → `fn_build_opportunity_won_payload` (payload rico p/ Nammux) | 127 |
| `contact.updated` | UPDATE em `contacts` | 5 |

Convenção: `{aggregate_type}.{created|updated}` + especializações (`message.outbound_sent`, `opportunity.stage_changed`, `opportunity.won`). Idempotência: `{aggregate}:{id}:{event_type}:{epoch}`.

Supressão em imports: `SET LOCAL app.skip_event_emit = 'true'`.

## 2. Fila inbound — eventos consumidos (`integration_inbound_events`)

Webhooks gravam raw na fila (dedup por `(integration_slug, idempotency_key)`); `integration-inbound-dispatcher` consome via claim/lease; dead letter em `integration_inbound_dead_letter_archive`; cleanup diário 03:00.

| integration_slug | Volume em prod | Nota |
|---|---|---|
| `twilio-whatsapp` | 110.475 | Único slug ativo na fila |

⚠️ **Meta Cloud ainda não passa pela fila** — `meta-whatsapp-webhook` usa o caminho legado (escrita direta), cutover pendente ([ADR-0004](../../decisions/0004-inbound-events-queue.md), specs em `docs/inbox-v2/`). SuvSign: ingest previsto na Fase 1 do inbox-v2 (`fn_feature_flag_enabled('inbox_v2.ingest.suvsign', …)`).

## 3. Webhooks recebidos (payloads externos)

| Webhook | Eventos consumidos | Payload |
|---|---|---|
| `meta-whatsapp-webhook` | mensagens, statuses, `referral` CTWA (`source_id`, `ctwa_clid`, `headline`, `body`) | `[TODO]` schema; detalhe do referral em [`operations/audits/2026-07-ctwa-janela-72h.md`](../../operations/audits/2026-07-ctwa-janela-72h.md) |
| `twilio-whatsapp-webhook` | mensagens inbound + status callbacks | `[TODO]` |
| `twilio-webhook` | eventos de status de chamada (Voice) | `[TODO]` |
| `suvsign-webhook` | callback de assinatura de documento | `[TODO]` |
| `lead-webhook` | lead genérico → contact/opportunity | `[TODO]` |

## 4. Meta CAPI — eventos enviados

Triggers `trg_capi_lead_on_contact_*` (Lead) e won em `opportunities` (Purchase) → `fn_capi_dispatch_event` → `capi_event_log` (auditoria/retry 5min via `meta-capi-retry-cron`) → `POST /{pixel}/events` com PII em SHA-256.

## 5. Realtime (frontend)

Tabelas na publication `supabase_realtime` (RLS aplicada aos subscribers): `calls`, `document_submissions`, `document_types`, `import_logs`, `message_threads`, `messages`, `notifications`.

## 6. Crons

15 jobs pg_cron — tabela única em [`operations/README.md`](../../operations/README.md) (não replicada aqui).

## `[TODO]`
- Schemas JSON dos payloads de webhook (extrair de exemplos reais na fila inbound).
- Payload canônico de cada `event_type` do outbox (hoje derivável de `fn_publish_integration_event` em [`../database/trigger-functions.sql`](../database/trigger-functions.sql)).
