# Auditoria e correção de `service-events` + `service-health` (Outbox Worker)

## Diagnóstico (verificado no código e no banco)

Estado real do `integration_jobs` hoje: `dead_letter` = 5549 (o mais recente em **2026-05-26**), `success` = 469, `pending` = 1, `failed` = 0, `running` presos > 5 min = 0, `dead_letter` nas últimas 24h = 0, `success_24h` = 18.

Em `integration_audit_logs`: `worker.retryable` = 5666 (último 2026-07-31), `retry_scheduled` = 127 (último 2026-07-31), `worker.permanent` = 10 (último 2026-05-26), `worker.success` = 470 (último agora, 2026-08-04 16:04).

Ou seja: **os eventos de falha existem no banco, mas são antigos**. A timeline só mostra sucesso por três defeitos concretos no endpoint:

1. **Não existe filtro por severidade.** O handler (`supabase/functions/service-events/index.ts:606-632`) só aceita `service`, `limit`, `cursor`, `status`, `from`, `to`. Não existe parâmetro `level`. Filtrar por Critical/Warning/Error no Kairos não tem efeito no servidor — vem a página mais recente, que é dominada por `worker.success`.
2. **O filtro `status` é aplicado só em parte das fontes.** Ele entra em `integration_jobs` e `integration_events`, mas **não** em `integration_audit_logs` (linhas 160-164). Com `status=failed`, as 470 linhas de `worker.success` continuam voltando — exatamente o sintoma relatado.
3. **Merge-then-slice sem cota por severidade.** Cada fonte busca `limit` linhas ordenadas por tempo desc, o resultado é concatenado, reordenado e cortado em `limit` (linhas 641-648). Como os eventos recentes são todos de sucesso, os eventos de falha (maio/julho) nunca entram na primeira página.
4. **Janela/cursor inconsistente em `integration_jobs`.** `applyWindow` usa `created_at` (linha 156), mas `occurredAt` é `completed_at ?? last_error_at ?? started_at ?? created_at` (linha 212). A paginação por keyset pode pular ou repetir eventos.
5. **Retentativas não aparecem como evento de job.** `jobLevel` trata `retry_scheduled`/`retrying` (linhas 141-146), mas esses valores não existem como status em `integration_jobs`; retry real está em `worker.retryable`/`retry_scheduled` no audit log — que hoje é engolido pelos itens 1-3.

No `service-health` (`supabase/functions/service-health/index.ts:93-114`): `stuck=0`, `failed=0` e heartbeat fresco, e a regra atual é `dead > 100 → warning`. Portanto o próprio endpoint retorna **`warning`**, não `critical` — e a métrica `deadLetter: 5549` é um **contador histórico total**, sem recorte de janela. O `Critical` visto no Kairos vem dessa métrica bruta (limiar do consumidor) e não de incidente ativo. [INCERTO] limiares internos do Kairos.

## O que será alterado

### `service-events`

- Novo parâmetro `level` (`info|warning|error|critical`, múltiplos separados por vírgula) aplicado **depois** da normalização dos eventos, para valer igual em todas as fontes.
- Novo parâmetro `severityOnly=true` (atalho para `level=warning,error,critical`).
- Propagar `status` também para `integration_audit_logs` (comparando com `action`) e ignorar valores incompatíveis por fonte em vez de aplicar em uma fonte só.
- **Busca dirigida por severidade**: quando há filtro de severidade (ou sempre, como cota mínima), consultar explicitamente as linhas relevantes — `integration_jobs` com `status in (failed, dead_letter)`, `running` antigo (stuck), e `integration_audit_logs` com `action in (worker.retryable, worker.permanent, retry_scheduled, *fail*, *error*, *dead_letter*)` — cada uma com seu próprio `order by ... desc limit`, unindo depois. Assim a página de falhas não compete com sucessos recentes.
- Cota mínima na página padrão (sem filtro): reservar parte do `limit` para eventos `warning`/`error`/`critical` mais recentes, para que a timeline sempre explique o estado.
- Alinhar `applyWindow`/cursor de `integration_jobs` à mesma coluna usada em `occurredAt` (`coalesce(completed_at, last_error_at, started_at, created_at)`), com ordenação e cursor coerentes.
- Extrair HTTP 4xx/5xx e timeout de `last_error` / `external_response` e refletir em `metadata.httpStatus`, no `summary` e no `level` (5xx/timeout → `error`; `dead_letter` → `critical`).
- Mapear `worker.permanent` explicitamente como `critical` ("Job encerrado como falha permanente") e `worker.retryable`/`retry_scheduled` como `warning` com tentativa/máximo.
- Novo campo por evento: `severitySource` (`job` | `audit` | `event`) e `nextCursor` corrigido para o critério de ordenação usado.

### `service-health`

- Separar **incidentes ativos** de **acumulado histórico** nas métricas do `outbox-worker`, sem quebrar as chaves existentes: manter `failed`, `deadLetter`, `pending`, `running`, `stuck5m`, `processed`, `errors` e acrescentar `deadLetter24h`, `failed24h`, `deadLetterTotal`, `lastDeadLetterAt`.
- Classificação passa a considerar **apenas a janela operacional (24h)** + sinais ativos: `stuck5m > 0` ou `deadLetter24h > 0` → `critical`; `failed24h > 0` ou `pending` acumulado alto → `warning`; heartbeat fresco e janela limpa → `healthy`. O total histórico deixa de degradar o status.
- Sem alteração de contrato (nenhum campo removido) e sem mudança em worker, dispatcher, banco, cron ou regras de negócio.

### Documentação

- Atualizar `docs/reference/api/service-events.md` (parâmetros `level`/`severityOnly`, cota de severidade, novos summaries e metadata) e `docs/reference/api/service-health.md` (novas métricas e nova regra de status com janela de 24h).

## Notas técnicas

- Somente leitura, `service_role` restrito à função; nenhuma migration, tabela, cron ou heartbeat novo.
- Privacidade inalterada: allowlist de `metadata`, sanitização de mensagens de erro, nada de payload/headers/PII.
- Validação após deploy: `?service=outbox-worker&level=critical` deve retornar os `dead_letter`/`worker.permanent` de 2026-05-26; `level=warning` deve retornar `worker.retryable`/`retry_scheduled` de 2026-07-31; página padrão deve conter ao menos um evento não-`info`; `service-health` deve reportar `outbox-worker` como `healthy` com `deadLetterTotal: 5549` e `deadLetter24h: 0`.
