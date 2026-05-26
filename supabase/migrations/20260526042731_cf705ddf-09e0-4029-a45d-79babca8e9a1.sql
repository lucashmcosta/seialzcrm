-- =========================================================
-- 1) Helper de org admin
-- =========================================================
create or replace function public.is_org_admin(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from user_organizations uo
      join permission_profiles pp on pp.id = uo.permission_profile_id
     where uo.user_id = current_user_id()
       and uo.organization_id = _org_id
       and uo.is_active = true
       and (pp.permissions->>'can_manage_users')::boolean = true
  );
$$;

-- =========================================================
-- 2) RLS de intelligence_settings — exigir admin
-- =========================================================
drop policy if exists intelligence_settings_insert_admin on public.intelligence_settings;
drop policy if exists intelligence_settings_update_admin on public.intelligence_settings;

create policy intelligence_settings_insert_admin
on public.intelligence_settings
for insert
to authenticated
with check (is_admin_user() or is_org_admin(organization_id));

create policy intelligence_settings_update_admin
on public.intelligence_settings
for update
to authenticated
using      (is_admin_user() or is_org_admin(organization_id))
with check (is_admin_user() or is_org_admin(organization_id));

-- =========================================================
-- 3) Trigger: message_response_times
-- =========================================================
create or replace function public.fn_calc_message_response_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inbound          messages%rowtype;
  v_opportunity_id   uuid;
  v_resp_seconds     integer;
begin
  if new.direction <> 'outbound' or new.deleted_at is not null then
    return new;
  end if;

  -- inbound anterior no mesmo thread sem outbound depois dela
  select m.* into v_inbound
    from messages m
   where m.thread_id = new.thread_id
     and m.direction = 'inbound'
     and m.deleted_at is null
     and m.sent_at < coalesce(new.sent_at, new.created_at)
     and not exists (
       select 1 from messages m2
        where m2.thread_id = new.thread_id
          and m2.direction = 'outbound'
          and m2.deleted_at is null
          and m2.id <> new.id
          and m2.sent_at > m.sent_at
          and m2.sent_at < coalesce(new.sent_at, new.created_at)
     )
   order by m.sent_at desc
   limit 1;

  if v_inbound.id is null then
    return new;
  end if;

  v_resp_seconds := greatest(0,
    extract(epoch from (coalesce(new.sent_at, new.created_at) - v_inbound.sent_at))::int);

  select opportunity_id into v_opportunity_id
    from message_threads where id = new.thread_id;

  insert into message_response_times(
    organization_id, thread_id, opportunity_id, user_id, contact_id,
    inbound_message_id, outbound_message_id,
    inbound_at, outbound_at, response_seconds
  )
  values (
    new.organization_id, new.thread_id, v_opportunity_id,
    new.sender_user_id,
    (select contact_id from message_threads where id = new.thread_id),
    v_inbound.id, new.id,
    v_inbound.sent_at, coalesce(new.sent_at, new.created_at),
    v_resp_seconds
  )
  on conflict do nothing;

  update messages set response_time_seconds = v_resp_seconds where id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_calc_message_response_time on public.messages;
create trigger trg_calc_message_response_time
after insert on public.messages
for each row execute function public.fn_calc_message_response_time();

-- =========================================================
-- 4) Trigger: opportunity_behavior_snapshot (mensagens)
-- =========================================================
create or replace function public.fn_messages_touch_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp        uuid;
  v_contact    uuid;
  v_is_audio   boolean := coalesce(new.media_type ilike 'audio%', false);
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select opportunity_id, contact_id into v_opp, v_contact
    from message_threads where id = new.thread_id;

  if v_opp is null then
    return new;
  end if;

  insert into opportunity_behavior_snapshot(
    opportunity_id, organization_id, contact_id,
    total_messages_inbound, total_messages_outbound,
    audios_inbound, audios_outbound,
    last_inbound_at, last_outbound_at,
    updated_at
  )
  values (
    v_opp, new.organization_id, v_contact,
    case when new.direction='inbound' then 1 else 0 end,
    case when new.direction='outbound' then 1 else 0 end,
    case when new.direction='inbound'  and v_is_audio then 1 else 0 end,
    case when new.direction='outbound' and v_is_audio then 1 else 0 end,
    case when new.direction='inbound'  then coalesce(new.sent_at,new.created_at) end,
    case when new.direction='outbound' then coalesce(new.sent_at,new.created_at) end,
    now()
  )
  on conflict (opportunity_id) do update set
    total_messages_inbound  = opportunity_behavior_snapshot.total_messages_inbound  + excluded.total_messages_inbound,
    total_messages_outbound = opportunity_behavior_snapshot.total_messages_outbound + excluded.total_messages_outbound,
    audios_inbound          = opportunity_behavior_snapshot.audios_inbound          + excluded.audios_inbound,
    audios_outbound         = opportunity_behavior_snapshot.audios_outbound         + excluded.audios_outbound,
    last_inbound_at  = greatest(opportunity_behavior_snapshot.last_inbound_at,  excluded.last_inbound_at),
    last_outbound_at = greatest(opportunity_behavior_snapshot.last_outbound_at, excluded.last_outbound_at),
    contact_id       = coalesce(opportunity_behavior_snapshot.contact_id, excluded.contact_id),
    updated_at       = now();

  return new;
end;
$$;

drop trigger if exists trg_messages_touch_snapshot on public.messages;
create trigger trg_messages_touch_snapshot
after insert on public.messages
for each row execute function public.fn_messages_touch_snapshot();

-- =========================================================
-- 5) Trigger: opportunity status -> finalize snapshot
-- =========================================================
create or replace function public.fn_opps_finalize_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_final     text;
  v_first_in  timestamptz;
  v_first_out timestamptz;
  v_first_resp int;
begin
  v_final := lower(new.status::text);
  if v_final not in ('won','lost','abandoned') then
    return new;
  end if;

  -- primeira resposta (lead -> vendedor)
  select min(rt.response_seconds) into v_first_resp
    from message_response_times rt
   where rt.opportunity_id = new.id;

  insert into opportunity_behavior_snapshot(
    opportunity_id, organization_id, contact_id, user_id,
    final_status, won_at, lost_at,
    first_response_seconds,
    days_to_close, updated_at
  )
  values (
    new.id, new.organization_id, new.contact_id, new.owner_user_id,
    v_final,
    case when v_final='won'  then now() end,
    case when v_final in ('lost','abandoned') then now() end,
    v_first_resp,
    extract(day from (now() - new.created_at))::int,
    now()
  )
  on conflict (opportunity_id) do update set
    final_status           = excluded.final_status,
    won_at                 = coalesce(opportunity_behavior_snapshot.won_at,  excluded.won_at),
    lost_at                = coalesce(opportunity_behavior_snapshot.lost_at, excluded.lost_at),
    user_id                = coalesce(opportunity_behavior_snapshot.user_id, excluded.user_id),
    first_response_seconds = coalesce(opportunity_behavior_snapshot.first_response_seconds, excluded.first_response_seconds),
    days_to_close          = excluded.days_to_close,
    updated_at             = now();

  return new;
end;
$$;

drop trigger if exists trg_opps_finalize_snapshot on public.opportunities;
create trigger trg_opps_finalize_snapshot
after update of status on public.opportunities
for each row when (old.status is distinct from new.status)
execute function public.fn_opps_finalize_snapshot();