# Ajuste de performance — Dashboard de Atendimento

## Problema

O Dashboard de Atendimento (`useServiceStats` + `useServiceWorstResponses`) hoje executa, **a cada abertura / troca de filtro**:

- `useServiceStats`:
  1. `count` em `message_threads` (não usado depois — pode remover)
  2. **Paginação completa** (1000 em 1000) de todas as threads do período em `message_threads`
  3. `count` de threads resolvidas em `message_threads`
  4. **Paginação completa** de `message_response_times` do período
  5. **Loop em chunks de 300 thread_ids** fazendo `IN (...)` paginado em `message_response_times` — pode virar 5, 10, 20+ requisições só nessa etapa

  Resultado real: **~10 a 50 round-trips** ao Supabase por carregamento, varrendo milhares de linhas no cliente para calcular médias e contagem distinta de contatos.

- `useServiceWorstResponses`: 1 query pesada de até 5000 linhas + 3 lookups (threads, contacts, users).

Isso pesa no Postgres (aparecem nas top queries do `pg_stat_statements`) e na rede.

## Solução

Mover a agregação para o Postgres via **duas RPCs `STABLE` `SECURITY DEFINER`** e fazer cada hook chamar **1 vez** por refresh. Cálculo continua igual; muda só o local da agregação.

### Migration (nova)

```sql
create or replace function public.get_service_dashboard_stats(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null
) returns table (
  contacts_count int,
  avg_first_response_seconds numeric,
  resolved_count int,
  total_count int,
  avg_response_seconds numeric
)
language sql stable security definer set search_path = public as $$
  with t as (
    select id, contact_id, resolved_at
    from message_threads
    where organization_id = p_org
      and created_at between p_from and p_to
      and (p_owner is null or assigned_user_id = p_owner)
  ),
  first_rt as (
    select distinct on (r.thread_id) r.thread_id, r.response_seconds
    from message_response_times r
    join t on t.id = r.thread_id
    where r.organization_id = p_org
      and r.inbound_at >= '2026-05-21'::timestamptz  -- SERVICE_MODULE_START
      and (p_owner is null or r.user_id = p_owner)
    order by r.thread_id, r.inbound_at asc
  ),
  all_rt as (
    select response_seconds
    from message_response_times
    where organization_id = p_org
      and created_at between greatest(p_from,'2026-05-21'::timestamptz) and p_to
      and (p_owner is null or user_id = p_owner)
  )
  select
    (select count(distinct contact_id)::int from t where contact_id is not null),
    (select avg(response_seconds) from first_rt where response_seconds >= 0),
    (select count(*)::int from t where resolved_at between p_from and p_to),
    (select count(*)::int from t),
    (select avg(response_seconds) from all_rt where response_seconds >= 0);
$$;

grant execute on function public.get_service_dashboard_stats(uuid,timestamptz,timestamptz,uuid)
  to authenticated, service_role;

create or replace function public.get_service_worst_responses(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null,
  p_kind text default 'all',   -- 'first' | 'all'
  p_limit int default 20
) returns table (
  id uuid,
  thread_id uuid,
  contact_id uuid,
  contact_name text,
  user_id uuid,
  user_name text,
  inbound_at timestamptz,
  outbound_at timestamptz,
  response_seconds numeric,
  median_seconds numeric,
  p90_seconds numeric,
  max_seconds numeric,
  total_count int
) language plpgsql stable security definer set search_path = public as $$
  -- builds the pool (all or first-per-thread), computes percentiles,
  -- returns top N enriched with contact_name + user_name
$$;

grant execute on function public.get_service_worst_responses(uuid,timestamptz,timestamptz,uuid,text,int)
  to authenticated, service_role;
```

Índices de apoio (criar se ainda não existirem — verificar antes):

```sql
create index if not exists idx_mrt_org_created
  on message_response_times (organization_id, created_at desc);
create index if not exists idx_mrt_thread_inbound
  on message_response_times (thread_id, inbound_at asc);
create index if not exists idx_mt_org_created
  on message_threads (organization_id, created_at desc);
```

### Frontend (somente refatoração dos 2 hooks)

- `src/hooks/useServiceStats.ts` — substituir toda a lógica por **1** chamada `supabase.rpc('get_service_dashboard_stats', {...})`. Mantém a mesma interface `ServiceStats` exportada — nenhuma página precisa mudar.
- `src/hooks/useServiceWorstResponses.ts` — substituir por **1** chamada `supabase.rpc('get_service_worst_responses', {...})`. Mesma interface `WorstResponseRow` / `WorstResponseStats`.

Nenhuma mudança em `ReportsPage.tsx`, `MobileReports.tsx`, UI ou design system.

## Ganho esperado

- Carregamento do dashboard: de **10–50 requisições** para **2 requisições**.
- Tempo total no Postgres por abertura: queda esperada de ~80–95% (agregação roda 1 vez no servidor, usando índices, em vez de várias varreduras paginadas).
- Remove o dashboard das top queries do `pg_stat_statements`.

## Risco

Baixo. Mudança isolada em 2 hooks + 1 migration aditiva (não altera tabelas existentes). Reversível voltando os hooks à versão atual.

## Fora de escopo

- Triggers (`fn_calc_message_response_time`) — continuam como estão.
- Crons (`integration-worker`, `intelligence-worker`) — não tocados.
- Inbox — já foi otimizada na etapa anterior.
