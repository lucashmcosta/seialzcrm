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

- Novo parâmetro `level` (`info|warning|error|critical`, múltiplos separados por vírgula) aplicado **depois** da normalização dos eventos, valendo igual em todas as fontes.
- Novo parâmetro `severityOnly=true` — equivalente a `level=warning,error,critical`.
- `status` passa a ter semântica explícita por fonte: `integration_jobs.status`, `integration_inbound_events.process_status`, `integration_events.status` e `integration_audit_logs.action`. Nenhuma fonte ignora o filtro; valor inaplicável a uma fonte exclui aquela fonte da página em vez de deixá-la passar sem filtro.
- **Busca dirigida por severidade** somente quando há `level`/`severityOnly`/`status`: consultas explícitas em `integration_jobs` (`failed`, `dead_letter`, `running` antigo) e `integration_audit_logs` (`worker.retryable`, `worker.permanent`, `retry_scheduled`, ações de falha/erro/dead letter), cada uma com seu `order by <ts> desc limit`. **Toda** consulta dirigida recebe integralmente `from`, `to` e `cursor` — `level=critical&from=<24h>` não pode retornar dead letters de maio; sem `from`, o filtro de nível pesquisa o histórico normalmente.
- **Sem cota mínima de severidade.** A página padrão (sem `level`) representa apenas atividade recente e respeita rigorosamente `from`, `to` e `cursor`. Eventos antigos aparecem só quando o período pedido os incluir, quando houver filtro explícito de `level`/`status`, ou via paginação histórica. O feed da TV continua sendo "o que aconteceu agora", não falha histórica.
- Extrair HTTP 4xx/5xx e timeout de `last_error` / `external_response` e refletir em `metadata.httpStatus`, no `summary` e no `level` (5xx/timeout → `error`; `dead_letter` → `critical`).
- Mapear `worker.permanent` como `critical` ("Job encerrado como falha permanente") e `worker.retryable`/`retry_scheduled` como `warning`, com tentativa/máximo.
- Novo campo por evento: `severitySource` (`job` | `audit` | `event`).

#### Ordenação e paginação

- Cada fonte é ordenada e paginada por **uma coluna estável e indexada**, e `occurredAt` passa a ser exatamente essa coluna — sem `coalesce` no `order by`. Em `integration_jobs`, isso significa dividir a leitura em duas consultas por intenção (finalizados por `completed_at`, falhas por `last_error_at`), cada uma com seu próprio cursor, em vez de ordenar por `created_at` e expor `completed_at` como `occurredAt` (defeito atual).
- `nextCursor` volta a ser coerente: cursor único por página derivado do `occurredAt` do último item, aplicado a todas as fontes na chamada seguinte. Se em alguma fonte a garantia de keyset global não for exata, a resposta declara isso em `pagination: { mode: "per-source-keyset" }` em vez de prometer paginação global incorreta.
- Se o client PostgREST não permitir expressar com segurança alguma dessas leituras, ela vira uma **função SQL somente leitura** (`SECURITY INVOKER`, apenas `SELECT`) criada por migration, chamada via `rpc`. Nenhuma escrita, nenhuma alteração de tabela existente.

### `service-health`

- Semântica nova das métricas do `outbox-worker`: `deadLetter` = **janela de 24h** (deixa de ser acumulado), `deadLetter24h` = mesmo valor explícito, `deadLetterTotal` = acumulado histórico, `lastDeadLetterAt` = data do último dead letter. Também `failed24h` além de `failed`. As chaves atuais permanecem presentes (`processed`, `errors`, `pending`, `running`, `stuck5m`, `failed`), apenas `deadLetter` muda de significado — mudança documentada e destacada para o Kairos.
- Classificação: `stuck5m > 0` ou `deadLetter24h > 0` → `critical`; `failed24h > 0` ou acúmulo operacional relevante (`pending` alto) → `warning`; heartbeat fresco e nenhuma falha recente → `healthy`. **`deadLetterTotal` não entra na classificação.**
- Sem mudança em worker, dispatcher, cron ou regras de negócio.

### Documentação

- Atualizar `docs/reference/api/service-events.md` (parâmetros `level`/`severityOnly`, semântica de `status` por fonte, ausência de cota de severidade, regra de janela, `pagination`, novos summaries/metadata) e `docs/reference/api/service-health.md` (nova semântica de `deadLetter`, novas métricas e nova regra de status por janela de 24h, com aviso explícito para usar `deadLetter24h` na causa/severidade).

## Notas técnicas

- Somente leitura, `service_role` restrito à função; nenhuma tabela, cron ou heartbeat novo (eventual função SQL de leitura é a única exceção, e só se necessária).
- Privacidade inalterada: allowlist de `metadata`, sanitização de mensagens de erro, nada de payload/headers/PII.

## Validação após deploy

- `service-health`: `outbox-worker` = `healthy`, `deadLetter24h = 0`, `deadLetterTotal = 5549`, `lastDeadLetterAt` em 2026-05-26.
- Página padrão recente de `service-events` não mostra falhas antigas.
- `level=critical` sem janela encontra os dead letters históricos.
- `level=critical&from=<últimas 24h>` retorna lista vazia.
- `level=warning` com período que inclua 2026-07-31 encontra `worker.retryable` e `retry_scheduled`.

