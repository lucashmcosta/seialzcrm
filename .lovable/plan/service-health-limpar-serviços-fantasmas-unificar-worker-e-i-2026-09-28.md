# service-health: limpar serviços fantasmas, unificar worker e instrumentar scheduler

## Linhas que saem de `supabase/functions/service-health/index.ts`

```text
299  // ---- Services without their own telemetry today     -> removida
300  services.push(unknownService("integration-worker", ...)) -> removida (vai para o bloco outbox-worker)
301  services.push(unknownService("public-subscriber-worker", ...)) -> removida
302  services.push(unknownService("redis", ...))              -> removida
303  services.push(unknownService("railway-backend", ...))    -> removida
304  services.push(unknownService("scheduler", ...))          -> substituída pelo bloco novo do scheduler
```

Os mesmos slugs saem também da allowlist do `service-events` (`index.ts:43-47` e `:52-56`), senão o serviço continuaria aceitando nomes que não existem mais. `docs/reference/api/service-health.md` e `service-events.md` serão atualizados, com a mudança marcada como breaking: 3 slugs removidos e 1 unificado.

## integration-worker x outbox-worker: fica um só, `outbox-worker`

São o mesmo processo: a edge function `integration-worker`, que roda a cada 30 s e drena `integration_jobs`. Vou manter o slug **`outbox-worker`** por três motivos:
- é o slug que já aparece como saudável no monitoramento do Kairos, então o histórico não quebra;
- descreve a função na arquitetura (fila Outbox, `docs/operations/README.md`);
- `service-events` já agrupa os eventos de `integration_jobs` e `integration_audit_logs` com esse nome.

O que muda no bloco `outbox-worker` (linhas 121-168):
- Mais uma leitura em paralelo: `outbox_system_heartbeats` com `component = 'integration-worker'`.
- `lastHeartbeat` passa a usar esse `last_run_at`, gravado em toda execução, inclusive quando não há jobs. Se a linha não existir, continua valendo o `worker_last_run_at` de hoje (último audit log).
- As métricas atuais ficam iguais. Entram só `lastRunProcessed` e `lastRunDurationMs`, vindos de `last_detail`.
- Ganho real: hoje um worker vivo e sem trabalho parece "parado", porque o audit log só registra quando há jobs. O heartbeat corrige isso.

## scheduler (pg_cron): proposta para aprovar antes de implementar

### (a) SQL da RPC, em migration nova

```sql
CREATE OR REPLACE FUNCTION public.fn_scheduler_health_summary(_window interval DEFAULT '1 hour')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $$
  WITH jobs AS (
    SELECT j.jobid, j.jobname, j.schedule, j.active
    FROM cron.job j
  ),
  runs AS (
    SELECT d.jobid,
           count(*)                                        AS runs,
           count(*) FILTER (WHERE d.status = 'succeeded')  AS succeeded,
           count(*) FILTER (WHERE d.status = 'failed')     AS failed,
           max(d.start_time)                               AS last_start,
           max(d.start_time) FILTER (WHERE d.status = 'failed') AS last_failed_at
    FROM cron.job_run_details d
    WHERE d.start_time >= now() - _window
    GROUP BY d.jobid
  ),
  last_run AS (
    SELECT DISTINCT ON (d.jobid) d.jobid, d.status, d.start_time, d.end_time
    FROM cron.job_run_details d
    WHERE d.start_time >= now() - interval '2 days'
    ORDER BY d.jobid, d.start_time DESC
  )
  SELECT jsonb_build_object(
    'window_seconds', extract(epoch FROM _window)::int,
    'last_run_at', (SELECT max(start_time) FROM last_run),
    'jobs_total',  (SELECT count(*) FROM jobs),
    'jobs_active', (SELECT count(*) FROM jobs WHERE active),
    'runs',        coalesce((SELECT sum(runs) FROM runs), 0),
    'succeeded',   coalesce((SELECT sum(succeeded) FROM runs), 0),
    'failed',      coalesce((SELECT sum(failed) FROM runs), 0),
    'running_stuck_15m', (SELECT count(*) FROM cron.job_run_details
                          WHERE status IN ('running','starting')
                            AND start_time < now() - interval '15 minutes'
                            AND start_time >= now() - interval '2 days'),
    'jobs', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_status', l.status, 'last_start', l.start_time,
        'duration_ms', (extract(epoch FROM (l.end_time - l.start_time)) * 1000)::int,
        'failed_in_window', coalesce(r.failed, 0)
      ) ORDER BY j.jobname)
      FROM jobs j
      LEFT JOIN last_run l USING (jobid)
      LEFT JOIN runs r USING (jobid)), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_scheduler_health_summary(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_scheduler_health_summary(interval) TO service_role;
```

- A função só lê. Nunca devolve `command`, `return_message`, `database` nem `username`, porque o comando dos jobs pode conter URL e token.
- Só `service_role` pode executar, e é ele que o service-health já usa.
- O filtro `start_time >= now() - 2 days` limita a varredura de `job_run_details`, que cresce sem limite.
- [INCERTO] Antes de aplicar, confirmar por leitura que o dono da função (postgres) tem SELECT em `cron.job_run_details` neste projeto. Se não tiver, a migration falha e nada é alterado.

### (b) O que retorna, com exemplo

```json
{ "window_seconds": 3600, "last_run_at": "2026-09-28T14:29:30Z",
  "jobs_total": 16, "jobs_active": 16, "runs": 480, "succeeded": 479, "failed": 1,
  "running_stuck_15m": 0,
  "jobs": [ { "name": "integration-worker", "schedule": "30 seconds", "active": true,
              "last_status": "succeeded", "last_start": "...", "duration_ms": 42,
              "failed_in_window": 0 } ] }
```

No service-health, vira `metrics`: `processed = succeeded`, `errors = failed`, `jobsActive`, `jobsTotal`, `stuck15m`. A lista `jobs` fica de fora do service-health. [TODO] Ela pode entrar depois no `service-events`, se você quiser.

### (c) Critério de status

O contrato já usa `healthy / warning / critical / unknown`. O "degraded" que você citou corresponde a warning ou critical:
- **unknown**: a RPC falhou (permissão ou pg_cron indisponível) ou `jobs_total = 0`.
- **critical**: `last_run_at` ausente ou com mais de 5 min (há jobs de 30 s, então silêncio de 5 min significa que o cron parou), ou `running_stuck_15m > 0`.
- **warning**: `failed > 0` na última hora, ou `last_run_at` entre 2 e 5 min, ou algum job ativo com `last_status = 'failed'`.
- **healthy**: nenhum dos casos acima.

Esses limites são próprios do scheduler, e não os 5/15 min dos outros serviços, porque o ritmo normal do scheduler é de 30 s.

## Ordem de execução, depois da aprovação

1. Ler as permissões de `cron.job_run_details`.
2. Migration da RPC.
3. Editar o `service-health`: remover os 5 serviços, unificar o outbox-worker e adicionar o bloco do scheduler.
4. Ajustar a allowlist do `service-events`.
5. Atualizar os documentos.
6. Publicar explicitamente as duas funções.
7. Validar: 401 sem token, e 200 mostrando 5 serviços (outbox-worker, inbox-reaper, inbox-dispatcher, evolution-api, scheduler) sem nenhum unknown fixo.

Nada muda nos workers, nas filas, no Inbox, no Outbox nem no integration-worker, que já grava o heartbeat.
