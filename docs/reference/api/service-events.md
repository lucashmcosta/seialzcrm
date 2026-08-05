# API — `service-events`

Histórico operacional **read-only** por serviço, consumido pelo **Kairos Tech**. Complementa `service-health` (que segue com o contrato inalterado, apenas snapshot agregado).

A função apenas **expõe** eventos que já existem hoje. Não cria heartbeat, tabela, cron ou evento artificial, não escreve nada e não altera Inbox, Outbox, workers, dispatcher ou regras de negócio.

---

## Endpoint

```
GET https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/service-events?service=<slug>&limit=50
```

`verify_jwt = false` — autenticação própria em código.

### Autenticação

| Header | Obrigatório | Valor |
|---|---|---|
| `x-health-token` | sim | valor do secret `SERVICE_HEALTH_TOKEN` (o mesmo de `service-health`) |

Token ausente/incorreto → `401 {"error":"unauthorized"}`.

### Parâmetros

| Parâmetro | Obrigatório | Default | Observação |
|---|---|---|---|
| `service` | sim | — | slug validado por allowlist; desconhecido → `400 {"error":"unknown_service"}` |
| `limit` | não | `50` | máximo `100`; valores fora da faixa são normalizados |
| `cursor` | não | — | ISO 8601 do `occurredAt` da última página (keyset descendente) |
| `level` | não | — | `info`, `warning`, `error`, `critical`; múltiplos separados por vírgula. Valor inválido → `400 {"error":"invalid_level"}` |
| `severityOnly` | não | `false` | `true` equivale a `level=warning,error,critical` |
| `status` | não | — | status nativo da fonte, aplicado em **todas** as fontes (`integration_jobs.status`, `integration_inbound_events.process_status`, `integration_events.status`, `integration_audit_logs.action`). Valor inaplicável a uma fonte exclui aquela fonte da página |
| `from` / `to` | não | — | janela ISO 8601 sobre o timestamp de ordenação da fonte |

Regras de janela e severidade:

- O filtro `level` é aplicado **após** a normalização dos eventos, então significa a mesma coisa em todas as fontes.
- **Não existe cota mínima de severidade.** A página padrão (sem `level`) é apenas atividade recente e respeita rigorosamente `from`, `to` e `cursor` — falhas antigas não são injetadas na timeline.
- Com `level`/`severityOnly`/`status`, as consultas dirigidas por severidade recebem integralmente `from`, `to` e `cursor`. Ou seja: `level=critical&from=<24h>` **não** retorna dead letters antigos; sem `from`, o filtro pesquisa o histórico.

### Exemplos

```bash
# feed recente (sem filtro de severidade)
curl -s ".../service-events?service=outbox-worker&limit=50" \
  -H "x-health-token: $SERVICE_HEALTH_TOKEN"

# apenas falhas nas últimas 24h
curl -s ".../service-events?service=outbox-worker&severityOnly=true&from=2026-08-03T16:00:00Z" \
  -H "x-health-token: $SERVICE_HEALTH_TOKEN"

# dead letters históricos
curl -s ".../service-events?service=outbox-worker&level=critical&limit=100" \
  -H "x-health-token: $SERVICE_HEALTH_TOKEN"
```


---

## Resposta

`200 application/json`. `500 {"error":"internal_error"}` em falha interna (detalhes só em log sanitizado).

```json
{
  "generated_at": "2026-08-03T16:40:00.000Z",
  "service": { "slug": "outbox-worker", "displayName": "Outbox Worker" },
  "events": [
    {
      "id": "job:9f2c...",
      "occurredAt": "2026-08-03T16:27:11.362Z",
      "level": "info",
      "status": "completed",
      "type": "outbox.job",
      "summary": "Webhook dispatch concluído com HTTP 200",
      "durationMs": 412,
      "attempt": 1,
      "maxAttempts": 8,
      "referenceId": "9f2c...",
      "metadata": {
        "integrationSlug": "nammux",
        "targetAction": "contact.upsert",
        "httpStatus": 200,
        "error": null,
        "integrationJobId": "9f2c...",
        "integrationEventId": "3ab1...",
        "subscriptionId": "77de...",
        "organizationId": "0b5c..."
      }
    }
  ],
  "filters": { "level": null, "status": null, "from": null, "to": null },
  "nextCursor": null,
  "pagination": { "mode": "per-source-keyset" }
}
```

### Campos

| Campo | Tipo | Observação |
|---|---|---|
| `events[].id` | string | id estável com prefixo da fonte (`job:`, `audit:`, `inbound:`, `dlq:`, …) |
| `events[].occurredAt` | ISO 8601 | **é exatamente a coluna de ordenação/paginação da fonte** (sem `coalesce`): `completed_at`, `last_error_at`, `started_at`, `created_at`, `received_at`, `occurred_at`, `archived_at` |
| `events[].level` | `info` \| `warning` \| `error` \| `critical` | derivado do status/ação da fonte; `dead_letter` e `worker.permanent` → `critical`; `worker.retryable`/`retry_scheduled` → `warning`; HTTP 5xx e timeout → `error` |
| `events[].status` | string \| null | status nativo da fonte (para `integration_audit_logs`, a `action`) |
| `events[].severitySource` | `job` \| `audit` \| `event` | de onde veio a severidade (apenas no `outbox-worker`) |
| `events[].type` | string | tipo técnico do evento |
| `events[].summary` | string | texto legível para troubleshooting |
| `events[].durationMs` | number \| null | apenas quando a fonte tem início e fim |
| `events[].attempt` / `maxAttempts` | number \| null | tentativas quando a fonte registra |
| `events[].referenceId` | string \| null | id do job/evento correlacionado |
| `events[].metadata` | object | allowlist de campos técnicos (inclui `httpStatus`, `timeout`, `processedAt`, `lastAttemptAt`) — ver Privacidade |
| `filters` | object | eco dos filtros aplicados (`level`, `status`, `from`, `to`) |
| `nextCursor` | string \| null | passar como `cursor` na próxima chamada |
| `pagination.mode` | `per-source-keyset` | cada fonte é paginada por sua própria coluna estável; o cursor é derivado do `occurredAt` do último item da página |

---

## Fontes por serviço

| `slug` | Fontes reais | Eventos expostos |
|---|---|---|
| `outbox-worker` | `integration_jobs`, `integration_audit_logs`, `integration_events` | job processado, retry agendado, job falhou, dead letter, job preso (`running` > 5 min), execução do worker, lote processado |
| `inbox-dispatcher` | `integration_inbound_events`, `integration_inbound_ingest_errors`, `integration_inbound_dead_letter_archive` | recebido, processado, falha, parse failure, retry, dead letter, arquivamento em DLQ |
| `inbox-reaper` | `outbox_system_heartbeats` (componente `reaper`) | última execução: horário, `reaped`, erro quando houver |
| `evolution-api` | `integration_inbound_events` (`evolution_api`), `evolution_instances`, `messages` (apenas `error_code`/`error_message`/`whatsapp_status` em endpoints Evolution) | `connection.update`, mudança de estado da instância, reconexão, falhas de envio, status HTTP upstream |
| `integration-worker` | sem fonte própria | `{"events": [], "nextCursor": null}` |
| `public-subscriber-worker` | sem fonte própria | `{"events": [], "nextCursor": null}` |
| `redis` | não observado pelo Seialz | `{"events": [], "nextCursor": null}` |
| `railway-backend` | não observado pelo Seialz | `{"events": [], "nextCursor": null}` |
| `scheduler` | sem fonte própria | `{"events": [], "nextCursor": null}` |

Nenhum evento é reaproveitado entre serviços. Serviços sem observabilidade própria retornam lista vazia até ganharem telemetria.

Notas:

- **`inbox-reaper`** guarda apenas a última execução (uma linha de heartbeat), portanto retorna no máximo um evento e `nextCursor: null`.
- **`evolution-api`** não consulta o servidor Evolution nesta entrega — somente dado já persistido no Seialz.
- Uma fonte indisponível degrada apenas a parte correspondente da página (leituras em `Promise.allSettled` com timeout de 8 s por fonte).

---

## Privacidade

`metadata` é uma **allowlist explícita** por fonte: identificadores técnicos (UUIDs), enums, contadores, códigos HTTP e mensagens de erro sanitizadas (chaves, bearer tokens, JWTs, telefones e e-mails são substituídos por `[REDACTED]`, com truncamento em 240 caracteres).

Nunca retornado: `raw_payload`, `raw_headers`, `headers`, `source_ip`, tokens, conteúdo de mensagem, telefone, e-mail ou qualquer PII. Nomes de instância Evolution são mascarados (`***1234`).

---

## Segurança e desempenho

- `service_role` usado apenas dentro da função.
- `service` validado por allowlist; `limit` limitado a 100.
- Todas as queries com `order by <timestamp> desc` e `limit` obrigatório sobre colunas de tempo já indexadas.
- Timeout de 8 s por fonte; erros internos retornam mensagem genérica.

---

## Configuração

| Env var | Uso |
|---|---|
| `SERVICE_HEALTH_TOKEN` | token exigido no header `x-health-token` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | leitura interna (service role nunca sai da função) |
