create or replace function public.fn_messages_touch_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp uuid; v_contact uuid;
  v_is_audio boolean := coalesce(new.media_type ilike 'audio%', false);
begin
  if new.deleted_at is not null then return new; end if;
  select opportunity_id, contact_id into v_opp, v_contact
    from message_threads where id = new.thread_id;
  if v_opp is null and v_contact is not null then
    select id into v_opp from opportunities
     where contact_id = v_contact and organization_id = new.organization_id
       and deleted_at is null and lower(status::text) not in ('won','lost','abandoned')
     order by created_at desc limit 1;
  end if;
  if v_opp is null then return new; end if;

  insert into opportunity_behavior_snapshot(
    opportunity_id, organization_id, contact_id,
    total_messages_inbound, total_messages_outbound,
    audios_inbound, audios_outbound, last_inbound_at, last_outbound_at, updated_at)
  values (v_opp, new.organization_id, v_contact,
    case when new.direction='inbound' then 1 else 0 end,
    case when new.direction='outbound' then 1 else 0 end,
    case when new.direction='inbound'  and v_is_audio then 1 else 0 end,
    case when new.direction='outbound' and v_is_audio then 1 else 0 end,
    case when new.direction='inbound'  then coalesce(new.sent_at,new.created_at) end,
    case when new.direction='outbound' then coalesce(new.sent_at,new.created_at) end,
    now())
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
end $$;

-- Backfill snapshots (últimos 30 dias)
with msg30 as (
  select m.id, m.organization_id, m.direction, m.media_type,
         coalesce(m.sent_at, m.created_at) as at_ts, t.contact_id as t_contact
    from messages m
    join message_threads t on t.id = m.thread_id
   where m.created_at > now() - interval '30 day' and m.deleted_at is null
), resolved as (
  select m.*, (
    select o.id from opportunities o
     where o.contact_id = m.t_contact and o.organization_id = m.organization_id and o.deleted_at is null
     order by case when lower(o.status::text) in ('won','lost','abandoned') then 1 else 0 end, o.created_at desc
     limit 1) as opp_id
    from msg30 m
), agg as (
  select opp_id, organization_id, (array_agg(t_contact))[1] as contact_id,
    sum(case when direction='inbound'  then 1 else 0 end)::int as ti,
    sum(case when direction='outbound' then 1 else 0 end)::int as to_,
    sum(case when direction='inbound'  and media_type ilike 'audio%' then 1 else 0 end)::int as ai,
    sum(case when direction='outbound' and media_type ilike 'audio%' then 1 else 0 end)::int as ao,
    max(case when direction='inbound'  then at_ts end) as last_in,
    max(case when direction='outbound' then at_ts end) as last_out
    from resolved where opp_id is not null
    group by opp_id, organization_id
)
insert into opportunity_behavior_snapshot(
  opportunity_id, organization_id, contact_id,
  total_messages_inbound, total_messages_outbound,
  audios_inbound, audios_outbound, last_inbound_at, last_outbound_at, updated_at)
select opp_id, organization_id, contact_id, ti, to_, ai, ao, last_in, last_out, now() from agg
on conflict (opportunity_id) do update set
  total_messages_inbound  = excluded.total_messages_inbound,
  total_messages_outbound = excluded.total_messages_outbound,
  audios_inbound          = excluded.audios_inbound,
  audios_outbound         = excluded.audios_outbound,
  last_inbound_at  = greatest(opportunity_behavior_snapshot.last_inbound_at,  excluded.last_inbound_at),
  last_outbound_at = greatest(opportunity_behavior_snapshot.last_outbound_at, excluded.last_outbound_at),
  contact_id       = coalesce(opportunity_behavior_snapshot.contact_id, excluded.contact_id),
  updated_at       = now();