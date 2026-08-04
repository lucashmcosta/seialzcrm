# API — `service-health`

Snapshot **read-only** da saúde operacional do Seialz, consumido pelo **Kairos Tech**.

A função apenas **expõe** estado já existente. Não cria heartbeat, não cria tabela, não cria cron, não escreve nada e não altera Inbox, Outbox, workers ou dispatcher.

---

## Endpoint

```
GET https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/service-health
```

`verify_jwt = false` — autenticação própria em código.

### Autenticação

| Header | Obrigatório | Valor |
|---|---|---|
| `x-health-token` | sim | valor do secret `SERVICE_HEALTH_TOKEN` |

Token ausente/incorreto → `401 {"error":"unauthorized"}`.

### Exemplo

```bash
curl -s https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/service-health \
  -H "x-health-token: $SERVICE_HEALTH_TOKEN"
```

---

## Resposta

`200 application/json` sempre que autenticado — o consumidor lê a saúde pelo corpo, não pelo status HTTP.
`500` apenas quando a função está mal configurada (sem credenciais de serviço).

```json
{
  "generated_at": "2026-08-03T14:20:00.000Z",
  "application": {
    "name": "Seialz CRM",
    "version": "seialz-crm@abc1234",
    "environment": "production",
    "commit": "abc1234"
  },
  "services": [
    {
      "slug": "outbox-worker",
      "name": "Outbox Worker",
      "status": "healthy",
      "lastHeartbeat": "2026-08-03T14:19:40.000Z",
      "uptimeSeconds": null,
      "version": null,
      "lastDeadLetterAt": "2026-05-26T02:14:00.000Z",
      "metrics": {
        "processed": 18,
        "errors": 0,
        "pending": 0,
        "running": 1,
        "stuck5m": 0,
        "failed": 0,
        "failed24h": 0,
        "deadLetter": 0,
        "deadLetter24h": 0,
        "deadLetterTotal": 5549
      }
    }
  ],
  "totalHealthy": 2,
  "totalWarning": 0,
  "totalCritical": 0
}
```

### Campos

| Campo | Tipo | Observação |
|---|---|---|
| `generated_at` | ISO 8601 | momento da leitura |
| `application.version` | string | `SENTRY_RELEASE` |
| `application.environment` | string | `ENVIRONMENT` (default `production`) |
| `application.commit` | string \| null | `COMMIT_SHA`, ou sufixo do release |
| `services[].status` | `healthy` \| `warning` \| `critical` \| `unknown` | ver regras abaixo |
| `services[].lastHeartbeat` | ISO 8601 \| null | `null` quando não há fonte |
| `services[].uptimeSeconds` | number \| null | `null` — não existe fonte hoje |
| `services[].version` | string \| null | `null` — não existe fonte hoje |
| `services[].metrics` | object | apenas métricas com fonte real; `{}` quando `unknown` |
| `services[].lastDeadLetterAt` | ISO 8601 \| null | apenas no `outbox-worker`: data do último dead letter registrado |
| `totalHealthy` / `totalWarning` / `totalCritical` | number | `unknown` não entra em nenhum total |

> **Mudança de semântica (atenção, Kairos):** `deadLetter` passou a ser a contagem da **janela de 24h**, e não mais o acumulado histórico. O acumulado agora é `deadLetterTotal`. Use `deadLetter24h` para causa/severidade; `deadLetterTotal` é backlog e **não** afeta o status.


---

## Serviços expostos e suas fontes

| `slug` | Fonte de telemetria hoje | Métricas |
|---|---|---|
| `outbox-worker` | `fn_outbox_health_summary_internal()` + contagens de 24h em `integration_jobs` (`worker_last_run_at` vem de `outbox_system_heartbeats` componente `integration-worker`, gravado a cada invocação mesmo com fila vazia) | `processed` (sucesso 24h), `errors` (falhas 24h), `pending`, `running`, `stuck5m`, `failed` (histórico), `failed24h`, `deadLetter` = `deadLetter24h`, `deadLetterTotal` (histórico), `lastDeadLetterAt` |
| `inbox-reaper` | `outbox_system_heartbeats` componente `reaper` | `processed` (`last_detail.reaped`) |
| `inbox-dispatcher` | `fn_inbound_health_summary('1 hour')` | `processed`, `errors`, `deadLetter`, `latencyMs` (média ponderada) |
| `evolution-api` | `evolution_instances` (`last_known_state`, `last_state_checked_at`), atualizado por webhook `CONNECTION_UPDATE` **e** pelo cron `evolution-health-check` (a cada 5 min) | `instancesOpen`, `instancesConnecting`, `instancesClose`, `instancesUnknown`, `instancesTotal`, `stateStale` (0/1), `stateAgeSeconds` (`-1` = nunca verificado) + campo `detail` legível |
| `integration-worker` | **sem telemetria própria** | — (`unknown`) |
| `public-subscriber-worker` | **sem telemetria própria** | — (`unknown`) |
| `redis` | não observado pelo Seialz | — (`unknown`) |
| `railway-backend` | não observado pelo Seialz | — (`unknown`) |
| `scheduler` | sem heartbeat próprio | — (`unknown`) |

Nenhuma fonte é reaproveitada entre serviços: um serviço só recebe status e métricas se tiver observabilidade própria. `integration-worker` permanece `unknown` justamente para não duplicar a telemetria do outbox e sugerir dois serviços independentes.

---

## Regras de status

| Status | Critério |
|---|---|
| `healthy` | heartbeat < 5 min e nenhuma falha na janela operacional de 24h |
| `warning` | heartbeat entre 5 e 15 min, ou `failed24h > 0`, ou acúmulo operacional (`pending > 100`), falhas no inbound, parte das instâncias Evolution fora do ar |
| `critical` | heartbeat > 15 min ou ausente para serviço que deveria bater, `stuck5m > 0`, `deadLetter24h > 0`, `dead_letter` no inbound, todas as instâncias Evolution fora do ar |
| `unknown` | serviço sem fonte de heartbeat hoje, ou janela sem eventos no dispatcher |

O backlog histórico de dead letters (`deadLetterTotal`) **nunca** entra na classificação: só a janela de 24h define severidade.


Casos específicos:

- **`outbox-worker`** tem heartbeat de vida próprio em `outbox_system_heartbeats` (`component='integration-worker'`, `last_detail = { processed, duration_ms, summary }`), gravado ao fim de **toda** invocação — inclusive com `processed = 0`. `integration_audit_logs` (actor `integration-worker`) é trilha de trabalho por job, não sinal de vida: usá-la como heartbeat gerava `critical` falso sempre que a fila ficava vazia por mais de 15 min.
- **`inbox-dispatcher`** não tem heartbeat próprio; a frescura é inferida dos eventos da última hora. Zero eventos na janela não é erro → `unknown`.
- Uma fonte indisponível degrada **apenas** o serviço correspondente (leituras em `Promise.allSettled`), o restante da resposta continua válido.

---

## Privacidade

A resposta contém somente contagens agregadas globais. Sem dados por organização, sem identificadores de contatos, sem PII, sem conteúdo de mensagens.

---

## Configuração

| Env var | Uso |
|---|---|
| `SERVICE_HEALTH_TOKEN` | token exigido no header `x-health-token` |
| `SENTRY_RELEASE` | `application.version` |
| `ENVIRONMENT` | `application.environment` |
| `COMMIT_SHA` | `application.commit` (opcional) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | leitura interna (service role nunca sai da função) |
