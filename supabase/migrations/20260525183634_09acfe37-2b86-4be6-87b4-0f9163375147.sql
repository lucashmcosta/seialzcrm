
-- =====================================================================
-- /obs read-only: admin visibility + aggregation RPCs
-- =====================================================================

-- 1) Admin SELECT policies (bypass org filter for /obs panel)
create policy "admins read inbound events"
  on public.integration_inbound_events for select
  to authenticated
  using (public.is_admin_user());

create policy "admins read ingest errors"
  on public.integration_inbound_ingest_errors for select
  to authenticated
  using (public.is_admin_user());

create policy "admins read dla"
  on public.integration_inbound_dead_letter_archive for select
  to authenticated
  using (public.is_admin_user());

create policy "admins read jobs"
  on public.integration_jobs for select
  to authenticated
  using (public.is_admin_user());

create policy "admins read events"
  on public.integration_events for select
  to authenticated
  using (public.is_admin_user());

create policy "admins read subscriptions"
  on public.integration_subscriptions for select
  to authenticated
  using (public.is_admin_user());

-- 2) Aggregation RPCs (SECURITY DEFINER, admin-only)

create or replace function public.fn_outbox_dlq_by_integration()
returns table (
  integration_slug text,
  target_action text,
  count bigint,
  last_error text,
  last_error_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    integration_slug,
    target_action,
    count(*)::bigint,
    (array_agg(last_error order by last_error_at desc nulls last))[1],
    max(last_error_at)
  from public.integration_jobs
  where status = 'dead_letter'
    and public.is_admin_user()
  group by integration_slug, target_action
  order by count(*) desc;
$$;

revoke all on function public.fn_outbox_dlq_by_integration() from public;
grant execute on function public.fn_outbox_dlq_by_integration() to authenticated;

create or replace function public.fn_outbox_top_errors(_window text default '24 hours', _limit int default 10)
returns table (
  message text,
  count bigint,
  last_seen timestamptz,
  sample_integration_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    substring(coalesce(last_error,'(no message)') for 200) as message,
    count(*)::bigint,
    max(coalesce(last_error_at, completed_at, created_at)) as last_seen,
    (array_agg(integration_slug order by coalesce(last_error_at, created_at) desc))[1]
  from public.integration_jobs
  where status in ('failed','dead_letter')
    and coalesce(last_error_at, completed_at, created_at) >= now() - _window::interval
    and last_error is not null
    and public.is_admin_user()
  group by 1
  order by 2 desc
  limit _limit;
$$;

revoke all on function public.fn_outbox_top_errors(text, int) from public;
grant execute on function public.fn_outbox_top_errors(text, int) to authenticated;

create or replace function public.fn_inbound_top_errors(_window text default '24 hours', _limit int default 10)
returns table (
  error_code text,
  message text,
  count bigint,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(error_code, '(none)'),
    substring(coalesce(error_message,'(no message)') for 200),
    count(*)::bigint,
    max(created_at)
  from public.integration_inbound_ingest_errors
  where created_at >= now() - _window::interval
    and public.is_admin_user()
  group by 1, 2
  order by 3 desc
  limit _limit;
$$;

revoke all on function public.fn_inbound_top_errors(text, int) from public;
grant execute on function public.fn_inbound_top_errors(text, int) to authenticated;
