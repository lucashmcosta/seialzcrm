# Modelo de dados — Mensagens

## Tabelas (linhas em 2026-07-04)

| Tabela | Linhas | Papel |
|---|---|---|
| `messages` | 177.463 | Item de thread (32 col, direção, tipo, conteúdo, status) |
| `message_threads` | 12.935 | Thread por contato/canal (36 col, `last_message_*` denormalizado) |
| `message_thread_reads` | 15.151 | Read state por usuário (3 col, 3 policies) |
| `message_thread_merge_audit` | 36 | Auditoria de merges (21 col) |
| `message_analyses` | 36.206 | Análise por IA (21 col) |
| `message_response_times` | 20.138 | SLA de resposta (12 col) |
| `message_snippets` | 8 | Snippets reutilizáveis (13 col) |
| `scheduled_messages` | 3 | ⚠️ Fn deployada mas sem cron (drift #3) |
| `thread_assignment_history` | 2.096 | Histórico de responsável |
| `thread_routing_rules` | 0 | Regras de roteamento |
| `communication_endpoints` | 20 | Número/canal remetente por org |
| `communication_endpoints_purpose_audit` | 4 | Mudanças de propósito |
| `attachments` | 2.425 | Anexos |
| `audio_transcriptions` | 3.096 | Transcrições (`transcribe-audio`) |
| `calls` | 5.082 | Chamadas Twilio |
| `call_recordings` | 20 | Gravações |
| `integration_inbound_events` | 110.473 | Fila de ingest deduplicada (42 col) |
| `integration_inbound_event_claims` | 0 | Claims do dispatcher |
| `integration_inbound_ingest_errors` | 281 | Erros de ingestão |

## Triggers em `messages` (12 — hot path)

`message_activity_trigger` (AFTER INS → `create_message_activity`), `messages_smart_reopen` (`trg_messages_smart_reopen`), `new_message_notification`, `trg_calc_message_response_time`, `trg_inbound_message_status`, `trg_messages_intelligence_enqueue` (BEFORE INS — enfileira `intelligence_jobs`), `trg_messages_touch_snapshot`, `trg_parse_lead_source_marker` ⚠️ UUID hardcoded, `trg_publish_event_messages` (`fn_publish_integration_event` — outbox), `trg_update_thread_last_message` (denormalização), `trigger_sanitize_agent_message` (BEFORE INS/UPD).

**Regra:** INSERT em massa deve pausar cron + inserir em lotes pequenos (ADR-0007). Alternativa `SET session_replication_role = replica` desliga TODAS as triggers (perigoso).

## Triggers em `message_threads`

`threads_round_robin` (BEFORE INS), `trg_handoff_notification`, `trg_log_thread_assignment_change`, `trg_message_threads_autofill_business_context`, `trg_validate_thread_endpoint_org` (BEFORE INS/UPD).

## Backfills ativos (drift #6)
- `messages_endpoint_backfill_2b` — **92.106 linhas** (candidato a arquivamento).
- `message_threads_business_context_backfill` — 17.285.
- `message_threads_business_context_backfill_20260703` — 308.
- `message_threads_business_context_backfill_null_20260703` — 38.
- `message_threads_primary_endpoint_backfill` — 3.967.

## RPCs
- `rpc_list_inbox_threads(p_organization_id, p_tab, p_only_mine, p_assigned_user_id, p_resolved_since, ...)`.
- `rpc_inbox_queue_counts(...)`.
- `rpc_list_message_threads(...)` — ⚠️ 2 overloads (drift #7).
- `rpc_get_message_threads_by_ids(...)`.
- `merge_message_threads` / `unmerge_message_thread`.
- `resolve_communication_endpoint(_organization_id, _channel, _address)`.
