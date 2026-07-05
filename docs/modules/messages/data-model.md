# Modelo de dados — Mensagens

| Tabela | Papel |
|---|---|
| `message_threads` | 36 col — thread por contato/canal, last_message_* denormalizado |
| `messages` | 32 col — item de thread (direção, tipo, conteúdo, status) |
| `message_thread_reads` | Read state por usuário (3 col, 3 policies) |
| `message_analyses` | Análise por IA (21 col) |
| `message_response_times` | SLA de resposta (12 col) |
| `message_snippets` | Snippets reutilizáveis (13 col) |
| `message_thread_merge_audit` | Auditoria de merges (21 col) |
| `thread_assignment_history` | Histórico de responsável (10 col) |
| `thread_routing_rules` | Regras de roteamento (9 col) |
| `scheduled_messages` | Envios agendados |
| `attachments` | Anexos (13 col) |
| `audio_transcriptions` | Transcrições (`transcribe-audio`) |
| `call_recordings`, `calls` | Voz Twilio |
| `integration_inbound_events` | Fila de ingest deduplicada (42 col) |
| `integration_inbound_event_claims` | Claims de dispatcher |
| `integration_inbound_ingest_errors` | Erros de ingestão |

RPCs: `rpc_list_threads` (paginação por cursor — memory `rpc-list-threads-pagination`).

Backfills ativos/dormentes:
- `message_threads_business_context_backfill*` (3 tabelas — candidato a consolidação).
- `message_threads_primary_endpoint_backfill`, `messages_endpoint_backfill_2b`.
