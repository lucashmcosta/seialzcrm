# service-health: respostas da auditoria (sem alterações)

## 1. Origem da lista
Está fixa no código. Não vem de tabela nem de variável de ambiente.
- `supabase/functions/service-health/index.ts:144` `outbox-worker`, `:176` `inbox-reaper`, `:223` `inbox-dispatcher`, `:277` `evolution-api`: cada um com a própria fonte.
- `index.ts:300-304`: os cinco são adicionados sempre, sem nenhuma consulta:
  `unknownService("integration-worker")`, `("public-subscriber-worker")`, `("redis")`, `("railway-backend")`, `("scheduler")`.
- `index.ts:60` `unknownService()` devolve `status: "unknown"`, `metrics: {}` e não tem outra saída.

## 2. Existem de fato?
- **integration-worker**: existe (edge fn, cron de 30 s). Porém, é o **mesmo processo** reportado como `outbox-worker`: o `outbox-worker` do health é medido pelo `integration_audit_logs` com actor `integration-worker`. Hoje ele aparece duas vezes. Ele **já grava heartbeat** em `outbox_system_heartbeats` com `component='integration-worker'` (`integration-worker/index.ts:67-76`), mas o service-health nunca lê essa linha.
- **public-subscriber-worker**: não existe no repositório. Não há edge fn, cron nem código com esse nome, só menções no service-health, no service-events e nos documentos de API. [INCERTO] Pode ser um serviço externo (Railway), mas o Seialz não tem nenhum rastro dele.
- **redis**: o Seialz não usa Redis diretamente. As únicas menções estão em `_shared/evolution/rate-limit.ts` (texto/comentário) e no service-health/service-events. [INCERTO] O Redis pode estar do lado da Evolution/Railway.
- **railway-backend**: existe como parte histórica da arquitetura (memória "Railway handles messaging"). Hoje o envio passa por `dispatch-whatsapp-send` → `meta-whatsapp-send`, direto das edge functions. Nenhum código consulta o Railway. [INCERTO] Não sei se ainda está ativo.
- **scheduler**: é o pg_cron, e ele existe (16 jobs, `docs/operations/README.md`). A função não consegue ler o `cron.job_run_details` sem uma estrutura nova.

## 3. Como o "unknown" é decidido
Não depende da idade do heartbeat nem de registro. Para esses cinco, o valor está **fixo no código** (`index.ts:300-304`), então nunca vai mudar, mesmo que cheguem heartbeats. Nos outros serviços, `unknown` aparece só quando a fonte falha na leitura (`index.ts:167, 185, 232, 295`). No `inbox-dispatcher`, também aparece quando não há eventos na janela (`index.ts:213-216`).

## 4. Mecanismo dos que estão saudáveis
- `outbox-worker`: RPC `fn_outbox_health_summary_internal`, com `worker_last_run_at` = último `integration_audit_logs` do actor integration-worker, mais contadores de `integration_jobs`.
- `inbox-reaper`: linha própria em `outbox_system_heartbeats` (`component='reaper'`), gravada pelo `fn_reap_stuck_jobs` (migration `20260523021034`, linha 64).
- `inbox-dispatcher`: freshness calculada a partir de `fn_inbound_health_summary('1 hour')`.
- `evolution-api`: `evolution_instances.last_state_checked_at`.

## Sugestão (para decidir depois, nada feito)
- `integration-worker`: não precisa instrumentar, porque o heartbeat já existe. Basta ler `outbox_system_heartbeats` e resolver a duplicidade com `outbox-worker` (juntar os dois ou separar "vida" e "fila").
- `scheduler`: dá para instrumentar lendo `cron.job_run_details` por uma RPC `security definer` somente leitura (exige migration).
- `public-subscriber-worker`, `redis`, `railway-backend`: confirmar com você se existem fora do Seialz. Se não existirem, remover da lista. Se existirem, é o próprio serviço que precisa enviar heartbeat.
