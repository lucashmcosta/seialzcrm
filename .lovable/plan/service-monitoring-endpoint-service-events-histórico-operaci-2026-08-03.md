# Service Monitoring — endpoint `service-events` (histórico operacional)

Nova Edge Function **somente leitura** que expõe o histórico de eventos reais por serviço, complementando `service-health` sem alterar seu contrato. Nenhuma alteração em workers, Inbox, Outbox, dispatcher, banco ou regras de negócio. Nenhuma migration, tabela, cron ou heartbeat novo.

## O que será criado

1. `supabase/functions/service-events/index.ts`
2. Entrada em `supabase/config.toml` com `verify_jwt = false`
3. `docs/reference/api/service-events.md`

## Autenticação e entrada

- Header `x-health-token` comparado com o secret já existente `SERVICE_HEALTH_TOKEN`; sem token válido → `401 {"error":"unauthorized"}`.
- Query string: `service` (obrigatório, validado por allowlist), `limit` (default 50, máx 100), `cursor` (ISO 8601 do último `occurredAt`, paginação keyset descendente), `status`, `from`, `to` (opcionais).
- `service` fora da allowlist → `400 {"error":"unknown_service"}`. `limit` inválido é normalizado, não erro.
- Toda query tem `order by <timestamp> desc` + `limit` obrigatório e usa colunas de tempo já indexadas.

## Contrato de resposta

Genérico e estável, exatamente como especificado: `generated_at`, `service {slug, displayName}`, `events[]` com `id`, `occurredAt`, `level`, `status`, `type`, `summary`, `durationMs`, `attempt`, `maxAttempts`, `referenceId`, `metadata`, e `nextCursor` (null quando a página não encheu).

## Fontes reais por serviço (verificadas no banco)

### `outbox-worker`
União ordenada por tempo de:

- `integration_jobs` — `status`, `attempts`, `max_attempts`, `last_error`, `last_error_at`, `started_at`/`completed_at` (duração), `integration_slug`, `target_action`, `event_id`, `subscription_id`. HTTP status extraído de `external_response` apenas como número.
- `integration_audit_logs` — ações reais existentes hoje (`worker.success`, `worker.retryable`, `retry_scheduled`, replays manuais), com `actor`, `job_id`, `event_id` e campos numéricos/enum de `details`.
- `integration_events` — `event_type`, `status`, `occurred_at`, `published_at` (sem `payload`).

`level`: sucesso → `info`; retry agendado → `warning`; falha → `error`; dead letter / job preso > 5 min → `critical`.

`summary` legível, por exemplo: "Webhook dispatch concluído com HTTP 200", "Job enviado para retry — tentativa 3 de 8", "Job movido para dead letter após HTTP 429", "Execução do worker concluída".

### `inbox-dispatcher`
`integration_inbound_events`: `received_at`, `process_status` (recebido/processado/falha/dead letter/retry/parse failure), `source_event`, `integration_slug`, `retry_count`, `max_attempts`, `error_classification`, `dead_letter_reason`, `process_error` sanitizado, latência (`processed_at − received_at`), `handler_key`, `parser_function`, `trace_id`. Complementado por `integration_inbound_ingest_errors` (`error_code`, `error_message`) e `integration_inbound_dead_letter_archive` (metadados apenas). Nunca `raw_payload`, `raw_headers`, `headers` ou `source_ip`.

### `inbox-reaper`
`outbox_system_heartbeats` componente `reaper`: `last_run_at` e contadores de `last_detail` (ex.: `reaped`), mais erro quando presente no detalhe. É uma única execução por linha — a fonte não guarda histórico, então a resposta traz no máximo o último evento e `nextCursor: null`.

### `evolution-api`
Somente dado já persistido no Seialz:

- `integration_inbound_events` com `integration_slug='evolution_api'`: `connection.update` (mudanças de estado/reconexão), `messages.upsert`/`messages.update` com falha, `error_classification`, `process_error` sanitizado, status HTTP upstream quando presente no erro.
- `evolution_instances`: `last_known_state`, `last_state_checked_at`, `instance_name`.
- Falhas de envio a partir de `messages` (`error_code`, `error_message`, `whatsapp_status`) restritas ao endpoint Evolution — nunca `content`, nunca telefone; identificadores mascarados.

Nenhuma chamada ao servidor Evolution nesta entrega.

### Sem fonte própria
`integration-worker`, `public-subscriber-worker`, `redis`, `railway-backend`, `scheduler` → `{"events": [], "nextCursor": null}`. Nenhum evento reaproveitado de outro serviço.

## Privacidade

`metadata` é uma allowlist explícita de campos por fonte: apenas identificadores técnicos, enums, contadores, códigos HTTP e mensagens de erro passadas por sanitização (reuso do padrão de `_shared/intelligence/sanitize.ts`). Sem payload, headers, tokens, conteúdo de mensagem, telefone, e-mail ou qualquer PII. `organization_id` incluído apenas como UUID para diagnóstico interno.

## Notas técnicas

- Deno + `jsr:@supabase/supabase-js@2`; `service_role` apenas dentro da função.
- Leituras em `Promise.allSettled` com timeout por fonte: uma fonte indisponível degrada só a parte correspondente, o resto da página continua válida.
- CORS com `x-health-token` liberado e handler `OPTIONS`.
- Erros internos retornam mensagem genérica; detalhes só em log sanitizado.
- Validação após o deploy: 401 sem token, resposta 200 por slug e checagem de que nenhum campo de payload/PII aparece na saída.
