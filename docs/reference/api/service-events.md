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
| `status` | não | — | filtra pelo status nativo da fonte (ex.: `failed`, `dead_letter`, `processed`) |
| `from` / `to` | não | — | janela ISO 8601 sobre o timestamp da fonte |

### Exemplo

```bash
curl -s "https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/service-events?service=outbox-worker&limit=50" \
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
  "nextCursor": null
}
```

### Campos

| Campo | Tipo | Observação |
|---|---|---|
| `events[].id` | string | id estável com prefixo da fonte (`job:`, `audit:`, `inbound:`, `dlq:`, …) |
| `events[].occurredAt` | ISO 8601 | ordenação descendente |
| `events[].level` | `info` \| `warning` \| `error` \| `critical` | derivado do status da fonte |
| `events[].status` | string \| null | status nativo da fonte |
| `events[].type` | string | tipo técnico do evento |
| `events[].summary` | string | texto legível para troubleshooting |
| `events[].durationMs` | number \| null | apenas quando a fonte tem início e fim |
| `events[].attempt` / `maxAttempts` | number \| null | tentativas quando a fonte registra |
| `events[].referenceId` | string \| null | id do job/evento correlacionado |
| `events[].metadata` | object | allowlist de campos técnicos (ver Privacidade) |
| `nextCursor` | string \| null | passar como `cursor` na próxima chamada |

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
