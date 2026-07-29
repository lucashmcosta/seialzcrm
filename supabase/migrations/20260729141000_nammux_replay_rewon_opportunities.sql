-- Re-winning an opportunity must publish a fresh canonical opportunity.won
-- delivery. The first win keeps the stable idempotency key; later transitions
-- are explicit replays so Nammux updates the existing one-to-one link instead
-- of creating a second process.

create or replace function public.fn_emit_opportunity_won_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_is_won boolean;
  v_old_is_won boolean := false;
  v_payload jsonb;
  v_idempotency_key text;
  v_original_event_id uuid;
begin
  if new.deleted_at is not null
     or new.organization_id is null
     or new.contact_id is null then
    return new;
  end if;

  select ps.type = 'won'
    into v_new_is_won
  from public.pipeline_stages ps
  where ps.id = new.pipeline_stage_id;

  if v_new_is_won is not true then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.pipeline_stage_id is not null then
    select ps.type = 'won'
      into v_old_is_won
    from public.pipeline_stages ps
    where ps.id = old.pipeline_stage_id;
  end if;

  if coalesce(v_old_is_won, false) then
    return new;
  end if;

  select ie.id
    into v_original_event_id
  from public.integration_events ie
  where ie.organization_id = new.organization_id
    and ie.aggregate_type = 'opportunity'
    and ie.aggregate_id = new.id
    and ie.event_type = 'opportunity.won'
  order by ie.occurred_at, ie.id
  limit 1;

  v_payload := public.fn_build_opportunity_won_payload(new.id);

  if v_original_event_id is null then
    v_idempotency_key :=
      'seialz:opportunity.won:' ||
      new.organization_id::text || ':' ||
      new.id::text;
  else
    v_idempotency_key :=
      'seialz:opportunity.won:' ||
      new.organization_id::text || ':' ||
      new.id::text || ':replay:rewon:' ||
      gen_random_uuid()::text;

    v_payload := v_payload || jsonb_build_object(
      '_replay',
      jsonb_build_object(
        'replay', true,
        'replay_reason', 'opportunity_rewon',
        'original_event_id', v_original_event_id,
        'requested_at', now()
      )
    );
  end if;

  insert into public.integration_events (
    organization_id,
    aggregate_type,
    aggregate_id,
    event_type,
    payload,
    idempotency_key,
    occurred_at,
    status
  )
  values (
    new.organization_id,
    'opportunity',
    new.id,
    'opportunity.won',
    v_payload,
    v_idempotency_key,
    now(),
    'pending'
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_emit_opportunity_won on public.opportunities;
create trigger trg_emit_opportunity_won
after insert or update of pipeline_stage_id, status, deleted_at
on public.opportunities
for each row
execute function public.fn_emit_opportunity_won_event();

