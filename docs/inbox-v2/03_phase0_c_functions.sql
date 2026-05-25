-- =====================================================================
-- Inbox v2 — Fase 0 (c): RPCs e funções
-- NÃO APLICAR ainda. Transacional.
-- Todas SECURITY DEFINER + SET search_path=public.
-- =====================================================================

begin;

-- ---------- 1. Feature flag resolver ----------
create or replace function public.fn_feature_flag_enabled(
  _flag_key text,
  _organization_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- org-specific tem prioridade
    (select enabled from public.integration_feature_flags
       where flag_key = _flag_key and organization_id = _organization_id
       limit 1),
    -- fallback global
    (select enabled from public.integration_feature_flags
       where flag_key = _flag_key and organization_id is null
       limit 1),
    false
  );
$$;

revoke all on function public.fn_feature_flag_enabled(text, uuid) from public;
grant execute on function public.fn_feature_flag_enabled(text, uuid) to service_role, authenticated;

-- ---------- 2. Claim de inbound events (FOR UPDATE SKIP LOCKED) ----------
create or replace function public.rpc_claim_inbound_events(
  _batch_size integer default 25,
  _integration_slug text default null,
  _worker_id text default null
) returns setof public.integration_inbound_events
language plpgsql
security definer
set search_path = public
as $$
declare
  _claimed_by text := coalesce(_worker_id, 'dispatcher-' || gen_random_uuid()::text);
begin
  return query
  with eligible as (
    select id
      from public.integration_inbound_events
     where process_status in ('received','retry')
       and shadow_mode = false
       and (next_run_at is null or next_run_at <= now())
       and (_integration_slug is null or integration_slug = _integration_slug)
     order by next_run_at nulls first, received_at
     limit _batch_size
     for update skip locked
  )
  update public.integration_inbound_events e
     set process_status = 'processing',
         claimed_at = now(),
         claimed_by = _claimed_by,
         parse_attempts = parse_attempts + 1,
         last_attempt_at = now()
    from eligible
   where e.id = eligible.id
  returning e.*;
end;
$$;

revoke all on function public.rpc_claim_inbound_events(integer, text, text) from public;
grant execute on function public.rpc_claim_inbound_events(integer, text, text) to service_role;

-- ---------- 3. Reaper de stuck (processing há > timeout) ----------
create or replace function public.fn_inbound_reap_stuck(
  _timeout interval default interval '5 minutes'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare _n integer;
begin
  update public.integration_inbound_events
     set process_status = 'retry',
         next_run_at = now(),
         process_error = coalesce(process_error,'') || ' [reaped:stuck]'
   where process_status = 'processing'
     and claimed_at < now() - _timeout
  returning 1 into _n;
  return coalesce(_n, 0);
end;
$$;

grant execute on function public.fn_inbound_reap_stuck(interval) to service_role;

-- ---------- 4. Schedule retry (backoff exponencial + jitter) ----------
create or replace function public.fn_inbound_schedule_retry(
  _event_id uuid,
  _error text,
  _classification text default 'Retryable'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _rec record;
  _next timestamptz;
  _backoff_seconds integer;
begin
  select retry_count, max_attempts into _rec
    from public.integration_inbound_events where id = _event_id;

  if _rec.retry_count + 1 >= _rec.max_attempts or _classification = 'Permanent' then
    update public.integration_inbound_events
       set process_status = 'dead_letter',
           retry_count = retry_count + 1,
           process_error = _error,
           error_classification = _classification,
           dead_letter_reason = _error,
           next_run_at = null
     where id = _event_id;
  else
    -- 2^n * 30s + jitter, cap 1h
    _backoff_seconds := least(3600, (power(2, _rec.retry_count + 1) * 30)::integer);
    _next := now() + make_interval(secs => _backoff_seconds + floor(random()*30)::integer);

    update public.integration_inbound_events
       set process_status = 'retry',
           retry_count = retry_count + 1,
           process_error = _error,
           error_classification = _classification,
           next_run_at = _next
     where id = _event_id;
  end if;
end;
$$;

grant execute on function public.fn_inbound_schedule_retry(uuid, text, text) to service_role;

-- ---------- 5. TTL marker (não deleta) ----------
create or replace function public.fn_inbound_expire(
  _ttl interval default interval '30 days'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare _n integer;
begin
  with upd as (
    update public.integration_inbound_events
       set process_status = 'expired'
     where process_status in ('received','retry')
       and received_at < now() - _ttl
     returning 1
  )
  select count(*) into _n from upd;
  return _n;
end;
$$;

grant execute on function public.fn_inbound_expire(interval) to service_role;

-- ---------- 6. Replay manual ----------
create or replace function public.fn_inbound_replay(_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.integration_inbound_events
     set process_status = 'received',
         retry_count = 0,
         next_run_at = now(),
         replay_count = replay_count + 1,
         process_error = null,
         error_classification = null,
         dead_letter_reason = null,
         claimed_at = null,
         claimed_by = null
   where id = _event_id;
end;
$$;

grant execute on function public.fn_inbound_replay(uuid) to service_role;

-- ---------- 7. Archive dead letter ----------
create or replace function public.fn_inbound_archive_dead_letter(_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.integration_inbound_dead_letter_archive
    (inbound_event_id, integration_slug, organization_id, event_type,
     dead_letter_reason, retry_count, raw_payload, raw_headers, archived_by)
  select id, integration_slug, organization_id, source_event,
         dead_letter_reason, retry_count, raw_payload, raw_headers, 'manual'
    from public.integration_inbound_events
   where id = _event_id and process_status = 'dead_letter';

  update public.integration_inbound_events
     set process_status = 'archived'
   where id = _event_id and process_status = 'dead_letter';
end;
$$;

grant execute on function public.fn_inbound_archive_dead_letter(uuid) to service_role;

-- ---------- 8. Health summary ----------
create or replace function public.fn_inbound_health_summary(
  _window interval default interval '1 hour'
) returns table (
  integration_slug text,
  status           text,
  count            bigint,
  avg_latency_sec  numeric,
  p95_latency_sec  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    integration_slug,
    process_status as status,
    count(*)::bigint as count,
    round(avg(extract(epoch from (coalesce(processed_at, now()) - received_at)))::numeric, 2) as avg_latency_sec,
    round(percentile_cont(0.95) within group (
      order by extract(epoch from (coalesce(processed_at, now()) - received_at))
    )::numeric, 2) as p95_latency_sec
  from public.integration_inbound_events
  where received_at > now() - _window
  group by integration_slug, process_status
  order by integration_slug, process_status;
$$;

grant execute on function public.fn_inbound_health_summary(interval) to service_role, authenticated;

commit;
