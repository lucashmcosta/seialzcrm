# Integração Seialz → Kairos Tech: endpoint `service-health`

Expor, em uma única resposta JSON, o estado operacional atual do Seialz para consumo pelo Kairos Tech. Somente leitura: nenhuma regra de negócio, Inbox, Outbox, worker, dispatcher ou schema de banco é alterado.

## O que será criado

1. `supabase/functions/service-health/index.ts` — Edge Function pública, autenticada por token de header.
2. Entrada em `supabase/config.toml` com `verify_jwt = false` (auth própria em código).
3. `docs/reference/api/service-health.md` — documentação da API em Markdown, no diretório de referência já existente.

Nada mais: sem migration, sem tabela, sem cron, sem heartbeat novo, sem alteração em funções existentes.

## Autenticação

Header `x-health-token` comparado com o secret `SERVICE_HEALTH_TOKEN` (mesmo padrão já usado por `outbox-health`). Sem token válido → `401 {"error":"unauthorized"}`. O secret será solicitado via o fluxo seguro de secrets antes do uso.

## Fontes de dados (apenas o que já existe hoje)

| Serviço exposto | Fonte atual | Métricas disponíveis |
|---|---|---|
| `outbox-worker` | `fn_outbox_health_summary_internal()` (`worker_last_run_at` = último `integration_audit_logs` com actor `integration-worker`) | processed (`success_24h`), errors (`failed_24h`), pending, running |
| `integration-worker` | sem heartbeat próprio (a telemetria existente pertence ao outbox-worker) | `status: "unknown"`, `metrics: {}` |
| `inbox-reaper` | `outbox_system_heartbeats` componente `reaper` (`last_run_at`, `last_detail.reaped`) | processed (`reaped`) |
| `inbox-dispatcher` | `fn_inbound_health_summary('1 hour')` agregada por status | processed, errors, latencyMs (avg_latency_sec × 1000) |
| `evolution-api` | `evolution_instances` (`last_known_state`, `last_state_checked_at`) | instâncias abertas / total |
| `public-subscriber-worker` | não possui heartbeat próprio | `status: "unknown"`, `metrics: {}` |
| `redis` | não observado pelo Seialz | `status: "unknown"` |
| `railway-backend` | não observado pelo Seialz | `status: "unknown"` |
| `scheduler` | `pg_cron` não é legível pela função sem nova estrutura; sem heartbeat próprio | `status: "unknown"` |

Nenhuma métrica inventada e nenhuma fonte reaproveitada entre serviços: cada serviço só recebe status e métricas se tiver fonte própria de monitoramento. Os demais ficam `unknown` com `metrics: {}` até ganharem telemetria própria. Campos sem fonte são omitidos (não zerados). `uptimeSeconds` e `version` por serviço só aparecem quando derivam de dado real; caso contrário são `null`.

## Regras de status (derivadas, sem novo estado persistido)

- `healthy`: heartbeat < 5 min e sem sinal de acúmulo de falhas.
- `warning`: heartbeat entre 5 e 15 min, ou acúmulo de erros (ex.: `failed > 50`, `dead_letter > 100`, `dead_letter` no inbound).
- `critical`: heartbeat > 15 min / ausente para serviço que deveria bater, ou jobs presos > 5 min (`running_stuck_5m > 0`).
- `unknown`: serviço sem fonte de heartbeat hoje. Não conta em nenhum dos totais.

## Resposta

Formato exatamente como especificado: `generated_at`, `application` (name, version = `SENTRY_RELEASE`, environment = `ENVIRONMENT`, commit = `COMMIT_SHA`/release quando presente) e `services[]`, mais os agregados `totalHealthy`, `totalWarning`, `totalCritical` no nível raiz. HTTP 200 sempre que autenticado (o consumidor lê o status pelo corpo); 500 apenas em falha de leitura do banco.

## Notas técnicas

- Deno + `jsr:@supabase/supabase-js@2`, `service_role` apenas dentro da função.
- CORS com `x-health-token` liberado e handler `OPTIONS`.
- Leituras em paralelo com `Promise.allSettled`: uma fonte indisponível degrada só o serviço correspondente.
- Sem dados por organização e sem PII na resposta — apenas contagens agregadas globais.
