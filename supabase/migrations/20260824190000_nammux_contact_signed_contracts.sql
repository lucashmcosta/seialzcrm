-- Signed SuvSign contracts belong to the contact and are delivered to every
-- won opportunity of that contact. This migration changes behavior only: it
-- adds no table or column and does not mutate existing documents on deploy.

create or replace function public.fn_enqueue_nammux_contact_contract_replays_v1(
  _document_id uuid,
  _replay_reason text default 'document_added_after_win'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_document public.documents%rowtype;
  v_document_type public.document_types%rowtype;
  v_opportunity record;
  v_payload jsonb;
  v_attachment jsonb;
  v_submission jsonb := '[]'::jsonb;
  v_idempotency_key text;
  v_eligible integer := 0;
  v_inserted integer := 0;
  v_row_count integer := 0;
begin
  select * into v_document
  from public.documents
  where id = _document_id
    and deleted_at is null;

  if v_document.id is null then
    return jsonb_build_object('ok', false, 'reason', 'document_not_found');
  end if;

  if v_document.entity_type <> 'contact'
     or v_document.external_source is distinct from 'suvsign'
     or v_document.external_ref is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'not_contact_suvsign_contract');
  end if;

  if not exists (
    select 1
    from public.organization_integrations oi
    join public.admin_integrations ai on ai.id = oi.integration_id
    where oi.organization_id = v_document.organization_id
      and ai.slug = 'nammux'
      and oi.is_enabled = true
      and lower(coalesce(oi.config_values->>'enabled', 'true')) in ('true', '1', 'yes', 'on')
      and lower(coalesce(oi.config_values->>'send_opportunity_won', 'true')) in ('true', '1', 'yes', 'on')
      and lower(coalesce(oi.config_values->>'include_opportunity_attachments', 'true')) in ('true', '1', 'yes', 'on')
  ) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'nammux_documents_disabled');
  end if;

  if not exists (
    select 1
    from public.integration_subscriptions s
    where s.organization_id = v_document.organization_id
      and s.integration_slug = 'nammux'
      and s.event_type = 'opportunity.won'
      and s.target_action = 'send_opportunity_won'
      and s.is_active = true
  ) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'nammux_subscription_inactive');
  end if;

  v_attachment := jsonb_build_object(
    'id', v_document.id,
    'entity_type', 'contact',
    'entity_id', v_document.entity_id,
    'bucket', v_document.bucket,
    'storage_path', v_document.storage_path,
    'file_name', v_document.file_name,
    'mime_type', v_document.mime_type,
    'size_bytes', v_document.size_bytes,
    'uploaded_by_user_id', v_document.uploaded_by_user_id,
    'created_at', v_document.created_at,
    'external_source', v_document.external_source,
    'external_ref', v_document.external_ref
  );

  if v_document.document_type_id is not null then
    select * into v_document_type
    from public.document_types
    where id = v_document.document_type_id
      and organization_id = v_document.organization_id
      and deleted_at is null;

    if found then
      v_submission := jsonb_build_array(jsonb_build_object(
        'id', v_document.id,
        'status', 'approved',
        'document_type_id', v_document.document_type_id,
        'attachment_id', v_document.id,
        'document_type_code', v_document_type.code,
        'document_type_name', v_document_type.name,
        'file_name', v_document.file_name,
        'mime_type', v_document.mime_type,
        'size_bytes', v_document.size_bytes,
        'bucket', v_document.bucket,
        'storage_path', v_document.storage_path,
        'entity_type', 'contact',
        'entity_id', v_document.entity_id
      ));
    end if;
  end if;

  for v_opportunity in
    select o.id
    from public.opportunities o
    join public.pipeline_stages ps
      on ps.id = o.pipeline_stage_id
     and ps.type = 'won'
    where o.organization_id = v_document.organization_id
      and o.contact_id = v_document.entity_id
      and o.deleted_at is null
    order by o.close_date nulls last, o.created_at, o.id
  loop
    v_eligible := v_eligible + 1;
    v_payload := public.fn_build_opportunity_won_payload(v_opportunity.id);
    v_payload := jsonb_set(v_payload, '{attachments}', jsonb_build_array(v_attachment), true);
    v_payload := jsonb_set(v_payload, '{document_submissions}', v_submission, true);
    v_payload := v_payload || jsonb_build_object(
      '_replay', jsonb_build_object(
        'replay', true,
        'replay_reason', coalesce(nullif(btrim(_replay_reason), ''), 'document_added_after_win'),
        'document_id', v_document.id,
        'contact_id', v_document.entity_id,
        'requested_at', now()
      )
    );

    v_idempotency_key :=
      'seialz:opportunity.won:' || v_document.organization_id::text || ':' ||
      v_opportunity.id::text || ':replay:contact-document:' || v_document.id::text;

    insert into public.integration_events (
      organization_id,
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      idempotency_key,
      occurred_at,
      status
    ) values (
      v_document.organization_id,
      'opportunity',
      v_opportunity.id,
      'opportunity.won',
      v_payload,
      v_idempotency_key,
      now(),
      'pending'
    )
    on conflict (idempotency_key) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'document_id', v_document.id,
    'contact_id', v_document.entity_id,
    'eligible_opportunities', v_eligible,
    'events_inserted', v_inserted,
    'events_existing', v_eligible - v_inserted
  );
end;
$function$;

revoke all on function public.fn_enqueue_nammux_contact_contract_replays_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fn_enqueue_nammux_contact_contract_replays_v1(uuid, text)
  to service_role;

create or replace function public.fn_emit_nammux_contact_contract_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.entity_type = 'contact'
     and new.external_source = 'suvsign'
     and new.external_ref is not null
     and new.deleted_at is null then
    perform public.fn_enqueue_nammux_contact_contract_replays_v1(
      new.id,
      'document_added_after_win'
    );
  end if;
  return new;
exception
  when others then
    raise warning 'contact contract replay enqueue failed for document %: %', new.id, sqlerrm;
    return new;
end;
$function$;

revoke all on function public.fn_emit_nammux_contact_contract_v1()
  from public, anon, authenticated;
grant execute on function public.fn_emit_nammux_contact_contract_v1()
  to service_role;

drop trigger if exists trg_emit_nammux_contact_contract_v1 on public.documents;
create trigger trg_emit_nammux_contact_contract_v1
after insert on public.documents
for each row execute function public.fn_emit_nammux_contact_contract_v1();

create or replace function public.nammux_contact_contract_backfill_v1(
  _organization_id uuid,
  _apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_contracts integer := 0;
  v_contacts integer := 0;
  v_to_move integer := 0;
  v_invalid integer := 0;
  v_moved integer := 0;
  v_expected_pairs integer := 0;
  v_events_inserted integer := 0;
  v_result jsonb;
  v_document record;
begin
  with candidates as (
    select
      d.id,
      case
        when d.entity_type = 'contact' then d.entity_id
        when d.entity_type = 'opportunity' then o.contact_id
        else null
      end as contact_id,
      d.entity_type
    from public.documents d
    left join public.opportunities o
      on d.entity_type = 'opportunity'
     and o.id = d.entity_id
     and o.organization_id = d.organization_id
     and o.deleted_at is null
    where d.organization_id = _organization_id
      and d.external_source = 'suvsign'
      and d.external_ref is not null
      and d.deleted_at is null
      and d.entity_type in ('contact', 'opportunity')
  )
  select
    count(*),
    count(distinct contact_id) filter (where contact_id is not null),
    count(*) filter (where entity_type = 'opportunity' and contact_id is not null),
    count(*) filter (where contact_id is null)
  into v_contracts, v_contacts, v_to_move, v_invalid
  from candidates;

  with candidates as (
    select
      d.id,
      case
        when d.entity_type = 'contact' then d.entity_id
        when d.entity_type = 'opportunity' then o.contact_id
        else null
      end as contact_id
    from public.documents d
    left join public.opportunities o
      on d.entity_type = 'opportunity'
     and o.id = d.entity_id
     and o.organization_id = d.organization_id
     and o.deleted_at is null
    where d.organization_id = _organization_id
      and d.external_source = 'suvsign'
      and d.external_ref is not null
      and d.deleted_at is null
      and d.entity_type in ('contact', 'opportunity')
  )
  select count(*) into v_expected_pairs
  from candidates c
  join public.opportunities o
    on o.organization_id = _organization_id
   and o.contact_id = c.contact_id
   and o.deleted_at is null
  join public.pipeline_stages ps
    on ps.id = o.pipeline_stage_id
   and ps.type = 'won'
  where c.contact_id is not null;

  if not _apply then
    return jsonb_build_object(
      'ok', true,
      'mode', 'dry_run',
      'organization_id', _organization_id,
      'contracts', v_contracts,
      'contacts', v_contacts,
      'contracts_to_move', v_to_move,
      'invalid_contracts', v_invalid,
      'expected_opportunity_document_pairs', v_expected_pairs
    );
  end if;

  with ownership as (
    select d.id, o.contact_id
    from public.documents d
    join public.opportunities o
      on o.id = d.entity_id
     and o.organization_id = d.organization_id
     and o.deleted_at is null
    where d.organization_id = _organization_id
      and d.external_source = 'suvsign'
      and d.external_ref is not null
      and d.deleted_at is null
      and d.entity_type = 'opportunity'
      and o.contact_id is not null
  )
  update public.documents d
  set entity_type = 'contact',
      entity_id = ownership.contact_id
  from ownership
  where d.id = ownership.id;

  get diagnostics v_moved = row_count;

  for v_document in
    select d.id
    from public.documents d
    where d.organization_id = _organization_id
      and d.external_source = 'suvsign'
      and d.external_ref is not null
      and d.deleted_at is null
      and d.entity_type = 'contact'
    order by d.created_at, d.id
  loop
    v_result := public.fn_enqueue_nammux_contact_contract_replays_v1(
      v_document.id,
      'historical_document_backfill'
    );
    v_events_inserted := v_events_inserted + coalesce((v_result->>'events_inserted')::integer, 0);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mode', 'apply',
    'organization_id', _organization_id,
    'contracts', v_contracts,
    'contacts', v_contacts,
    'contracts_moved', v_moved,
    'invalid_contracts', v_invalid,
    'expected_opportunity_document_pairs', v_expected_pairs,
    'events_inserted', v_events_inserted
  );
end;
$function$;

revoke all on function public.nammux_contact_contract_backfill_v1(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.nammux_contact_contract_backfill_v1(uuid, boolean)
  to service_role;

create or replace function public.nammux_contact_contract_audit_v1(
  _organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with contracts as (
    select d.id, d.entity_id as contact_id
    from public.documents d
    where d.organization_id = _organization_id
      and d.external_source = 'suvsign'
      and d.external_ref is not null
      and d.deleted_at is null
      and d.entity_type = 'contact'
  ), expected as (
    select c.id as document_id, o.id as opportunity_id
    from contracts c
    join public.opportunities o
      on o.organization_id = _organization_id
     and o.contact_id = c.contact_id
     and o.deleted_at is null
    join public.pipeline_stages ps
      on ps.id = o.pipeline_stage_id
     and ps.type = 'won'
  ), delivered as (
    select distinct ie.aggregate_id as opportunity_id,
      ie.payload #>> '{data,_replay,document_id}' as wrapped_document_id,
      ie.payload #>> '{_replay,document_id}' as direct_document_id
    from public.integration_events ie
    where ie.organization_id = _organization_id
      and ie.event_type = 'opportunity.won'
      and ie.idempotency_key like '%:replay:contact-document:%'
  )
  select jsonb_build_object(
    'organization_id', _organization_id,
    'contact_contracts', (select count(*) from contracts),
    'contacts_with_contract', (select count(distinct contact_id) from contracts),
    'expected_pairs', (select count(*) from expected),
    'replay_events', (select count(*) from delivered),
    'missing_replay_pairs', (
      select count(*)
      from expected e
      where not exists (
        select 1 from delivered d
        where d.opportunity_id = e.opportunity_id
          and coalesce(d.wrapped_document_id, d.direct_document_id) = e.document_id::text
      )
    ),
    'opportunity_owned_suvsign_contracts', (
      select count(*) from public.documents d
      where d.organization_id = _organization_id
        and d.external_source = 'suvsign'
        and d.external_ref is not null
        and d.deleted_at is null
        and d.entity_type = 'opportunity'
    )
  );
$function$;

revoke all on function public.nammux_contact_contract_audit_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.nammux_contact_contract_audit_v1(uuid)
  to service_role;

comment on function public.nammux_contact_contract_backfill_v1(uuid, boolean) is
  'Dry-runs or applies the idempotent SuvSign contract ownership backfill and Nammux replay fan-out without changing the data model.';
