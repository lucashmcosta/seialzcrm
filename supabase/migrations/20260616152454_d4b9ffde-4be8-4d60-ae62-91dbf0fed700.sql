
-- RPC: Service Dashboard Stats
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
  with cutoff as (
    select '2026-05-30T03:00:00Z'::timestamptz as service_start
  ),
  t as (
    select id, contact_id, resolved_at
    from message_threads
    where organization_id = p_org
      and created_at >= greatest(p_from, (select service_start from cutoff))
      and created_at <= p_to
      and (p_owner is null or assigned_user_id = p_owner)
  ),
  first_rt as (
    select distinct on (r.thread_id) r.thread_id, r.response_seconds
    from message_response_times r
    join t on t.id = r.thread_id
    where r.organization_id = p_org
      and r.inbound_at >= (select service_start from cutoff)
      and (p_owner is null or r.user_id = p_owner)
    order by r.thread_id, r.inbound_at asc
  ),
  all_rt as (
    select response_seconds
    from message_response_times
    where organization_id = p_org
      and created_at >= greatest(p_from, (select service_start from cutoff))
      and created_at <= p_to
      and (p_owner is null or user_id = p_owner)
  )
  select
    (select count(distinct contact_id)::int from t where contact_id is not null),
    (select avg(response_seconds)::numeric from first_rt where response_seconds is not null and response_seconds >= 0),
    (select count(*)::int from t where resolved_at >= p_from and resolved_at <= p_to),
    (select count(*)::int from t),
    (select avg(response_seconds)::numeric from all_rt where response_seconds is not null and response_seconds >= 0);
$$;

grant execute on function public.get_service_dashboard_stats(uuid,timestamptz,timestamptz,uuid)
  to authenticated, service_role;

-- RPC: Service Worst Responses (top N + percentiles)
create or replace function public.get_service_worst_responses(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null,
  p_kind text default 'all',
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
  response_seconds integer,
  median_seconds numeric,
  p90_seconds numeric,
  max_seconds numeric,
  total_count int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_service_start timestamptz := '2026-05-30T03:00:00Z'::timestamptz;
  v_from timestamptz := greatest(p_from, v_service_start);
  v_median numeric;
  v_p90 numeric;
  v_max numeric;
  v_count int;
begin
  -- Build pool into a temp set via CTE; compute stats then top N.
  create temp table _pool on commit drop as
  with base as (
    select r.id, r.thread_id, r.user_id, r.inbound_at, r.outbound_at, r.response_seconds
    from message_response_times r
    where r.organization_id = p_org
      and r.created_at >= v_from
      and r.created_at <= p_to
      and r.inbound_at >= v_service_start
      and r.response_seconds is not null
      and r.response_seconds >= 0
      and (p_owner is null or r.user_id = p_owner)
  ),
  ranked as (
    select b.*,
      row_number() over (partition by b.thread_id order by b.inbound_at asc) as rn
    from base b
  )
  select id, thread_id, user_id, inbound_at, outbound_at, response_seconds
  from ranked
  where (p_kind <> 'first') or rn = 1;

  select
    percentile_cont(0.5) within group (order by response_seconds),
    percentile_cont(0.9) within group (order by response_seconds),
    max(response_seconds),
    count(*)
  into v_median, v_p90, v_max, v_count
  from _pool;

  return query
  with top as (
    select * from _pool
    order by response_seconds desc
    limit p_limit
  )
  select
    tp.id,
    tp.thread_id,
    mt.contact_id,
    c.full_name as contact_name,
    tp.user_id,
    u.full_name as user_name,
    tp.inbound_at,
    tp.outbound_at,
    tp.response_seconds,
    v_median,
    v_p90,
    v_max,
    v_count
  from top tp
  left join message_threads mt on mt.id = tp.thread_id
  left join contacts c on c.id = mt.contact_id
  left join users u on u.id = tp.user_id;
end;
$$;

grant execute on function public.get_service_worst_responses(uuid,timestamptz,timestamptz,uuid,text,int)
  to authenticated, service_role;

-- Supporting indexes (no-op if exist)
create index if not exists idx_mrt_org_created
  on message_response_times (organization_id, created_at desc);
create index if not exists idx_mrt_thread_inbound
  on message_response_times (thread_id, inbound_at asc);
create index if not exists idx_mt_org_created
  on message_threads (organization_id, created_at desc);
