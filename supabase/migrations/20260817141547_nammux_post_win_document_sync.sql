-- Automatic delivery of opportunity documents created after the opportunity
-- was already sent to Nammux.
--
-- The trigger only writes to the existing integration_events outbox. Network
-- delivery remains the responsibility of integration-worker, preserving its
-- retry/DLQ semantics and keeping document uploads independent from Nammux.

create or replace function public.fn_emit_nammux_post_win_document()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload jsonb;
  v_attachment jsonb;
  v_submission jsonb := '[]'::jsonb;
  v_document_type public.document_types%rowtype;
  v_idempotency_key text;
begin
  -- Phase 1 is deliberately opportunity-scoped. Contact documents need an
  -- explicit routing policy because one contact may own several legal cases.
  if new.entity_type <> 'opportunity'
     or new.deleted_at is not null
     or coalesce(new.is_sample, false) then
    return new;
  end if;

  perform 1
  from public.opportunities o
  join public.pipeline_stages ps
    on ps.id = o.pipeline_stage_id
   and ps.type = 'won'
  where o.id = new.entity_id
    and o.organization_id = new.organization_id
    and o.deleted_at is null;

  if not found then
    return new;
  end if;

  -- Never create the first Nammux process because of a later upload. This
  -- automation only refreshes an opportunity whose original Nammux job was
  -- delivered successfully.
  if not exists (
    select 1
    from public.integration_events ie
    join public.integration_jobs ij
      on ij.event_id = ie.id
     and ij.organization_id = new.organization_id
     and ij.integration_slug = 'nammux'
     and ij.target_action = 'send_opportunity_won'
     and ij.status = 'success'
    where ie.organization_id = new.organization_id
      and ie.aggregate_type = 'opportunity'
      and ie.aggregate_id = new.entity_id
      and ie.event_type = 'opportunity.won'
  ) then
    return new;
  end if;

  -- Reuse the existing integration setting instead of introducing a hidden
  -- tenant flag. Organizations can disable post-win opportunity attachments
  -- from the Nammux settings screen.
  if not exists (
    select 1
    from public.organization_integrations oi
    join public.admin_integrations ai on ai.id = oi.integration_id
    where oi.organization_id = new.organization_id
      and ai.slug = 'nammux'
      and oi.is_enabled = true
      and lower(coalesce(oi.config_values->>'enabled', 'true')) in ('true', '1', 'yes', 'on')
      and lower(coalesce(oi.config_values->>'send_opportunity_won', 'true')) in ('true', '1', 'yes', 'on')
      and lower(coalesce(oi.config_values->>'include_opportunity_attachments', 'true')) in ('true', '1', 'yes', 'on')
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.integration_subscriptions s
    where s.organization_id = new.organization_id
      and s.integration_slug = 'nammux'
      and s.event_type = 'opportunity.won'
      and s.target_action = 'send_opportunity_won'
      and s.is_active = true
  ) then
    return new;
  end if;

  v_payload := public.fn_build_opportunity_won_payload(new.entity_id);

  v_attachment := jsonb_build_object(
    'id', new.id,
    'entity_type', new.entity_type,
    'entity_id', new.entity_id,
    'bucket', new.bucket,
    'storage_path', new.storage_path,
    'file_name', new.file_name,
    'mime_type', new.mime_type,
    'size_bytes', new.size_bytes,
    'uploaded_by_user_id', new.uploaded_by_user_id,
    'created_at', new.created_at
  );

  if new.document_type_id is not null then
    select * into v_document_type
    from public.document_types
    where id = new.document_type_id
      and organization_id = new.organization_id
      and deleted_at is null;

    if found then
      v_submission := jsonb_build_array(jsonb_build_object(
        'id', new.id,
        'status', 'approved',
        'document_type_id', new.document_type_id,
        'attachment_id', new.id,
        'document_type_code', v_document_type.code,
        'document_type_name', v_document_type.name,
        'file_name', new.file_name,
        'mime_type', new.mime_type,
        'size_bytes', new.size_bytes,
        'bucket', new.bucket,
        'storage_path', new.storage_path
      ));
    end if;
  end if;

  -- A focused payload prevents a late contract from sweeping unrelated
  -- contact documents into every legal process owned by the same contact.
  v_payload := jsonb_set(v_payload, '{attachments}', jsonb_build_array(v_attachment), true);
  v_payload := jsonb_set(v_payload, '{document_submissions}', v_submission, true);
  v_payload := v_payload || jsonb_build_object(
    '_replay', jsonb_build_object(
      'replay', true,
      'replay_reason', 'document_added_after_win',
      'document_id', new.id,
      'requested_at', now()
    )
  );

  v_idempotency_key :=
    'seialz:opportunity.won:' || new.organization_id::text || ':' ||
    new.entity_id::text || ':replay:document:' || new.id::text;

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
    new.organization_id,
    'opportunity',
    new.entity_id,
    'opportunity.won',
    v_payload,
    v_idempotency_key,
    now(),
    'pending'
  )
  on conflict (idempotency_key) do nothing;

  return new;
exception
  when others then
    -- A Nammux automation failure must never roll back a valid document row.
    -- Persist the incident in the existing tenant-scoped synchronization log.
    begin
      insert into public.nammux_sync_events (
        organization_id,
        opportunity_id,
        external_event_id,
        event_type,
        direction,
        status,
        summary,
        error,
        occurred_at
      ) values (
        new.organization_id,
        case when new.entity_type = 'opportunity' then new.entity_id else null end,
        'post-win-document:' || new.id::text,
        'document.added_after_win',
        'outbound',
        'error',
        jsonb_build_object('document_id', new.id),
        left(sqlerrm, 2000),
        now()
      )
      on conflict (organization_id, direction, external_event_id)
      do update set
        status = 'error',
        summary = excluded.summary,
        error = excluded.error,
        occurred_at = excluded.occurred_at;
    exception
      when others then
        raise warning 'nammux post-win document audit failed for document %: %', new.id, sqlerrm;
    end;
    return new;
end;
$function$;

revoke all on function public.fn_emit_nammux_post_win_document() from public, anon, authenticated;
grant execute on function public.fn_emit_nammux_post_win_document() to service_role;

drop trigger if exists trg_emit_nammux_post_win_document on public.documents;
create trigger trg_emit_nammux_post_win_document
after insert on public.documents
for each row execute function public.fn_emit_nammux_post_win_document();

comment on function public.fn_emit_nammux_post_win_document() is
  'Queues one idempotent focused opportunity.won replay when a new opportunity document is added after the original Nammux delivery.';

comment on trigger trg_emit_nammux_post_win_document on public.documents is
  'Automatically queues post-win opportunity documents for Nammux without performing network I/O in the document transaction.';

-- Backfill every existing opportunity document that belongs to a won
-- opportunity with a previously successful Nammux delivery. The same
-- deterministic key used by the trigger makes this statement safe to rerun.
with eligible_documents as materialized (
  select
    d.*,
    dt.code as document_type_code,
    dt.name as document_type_name
  from public.documents d
  join public.opportunities o
    on o.id = d.entity_id
   and o.organization_id = d.organization_id
   and o.deleted_at is null
  join public.pipeline_stages ps
    on ps.id = o.pipeline_stage_id
   and ps.type = 'won'
  left join public.document_types dt
    on dt.id = d.document_type_id
   and dt.organization_id = d.organization_id
   and dt.deleted_at is null
  where d.entity_type = 'opportunity'
    and d.deleted_at is null
    and coalesce(d.is_sample, false) = false
    and exists (
      select 1
      from public.integration_events ie
      join public.integration_jobs ij
        on ij.event_id = ie.id
       and ij.organization_id = d.organization_id
       and ij.integration_slug = 'nammux'
       and ij.target_action = 'send_opportunity_won'
       and ij.status = 'success'
      where ie.organization_id = d.organization_id
        and ie.aggregate_type = 'opportunity'
        and ie.aggregate_id = d.entity_id
        and ie.event_type = 'opportunity.won'
    )
    and exists (
      select 1
      from public.organization_integrations oi
      join public.admin_integrations ai on ai.id = oi.integration_id
      where oi.organization_id = d.organization_id
        and ai.slug = 'nammux'
        and oi.is_enabled = true
        and lower(coalesce(oi.config_values->>'enabled', 'true')) in ('true', '1', 'yes', 'on')
        and lower(coalesce(oi.config_values->>'send_opportunity_won', 'true')) in ('true', '1', 'yes', 'on')
        and lower(coalesce(oi.config_values->>'include_opportunity_attachments', 'true')) in ('true', '1', 'yes', 'on')
    )
    and exists (
      select 1
      from public.integration_subscriptions s
      where s.organization_id = d.organization_id
        and s.integration_slug = 'nammux'
        and s.event_type = 'opportunity.won'
        and s.target_action = 'send_opportunity_won'
        and s.is_active = true
    )
), backfill_payloads as materialized (
  select
    d.*,
    public.fn_build_opportunity_won_payload(d.entity_id) as base_payload,
    jsonb_build_object(
      'id', d.id,
      'entity_type', d.entity_type,
      'entity_id', d.entity_id,
      'bucket', d.bucket,
      'storage_path', d.storage_path,
      'file_name', d.file_name,
      'mime_type', d.mime_type,
      'size_bytes', d.size_bytes,
      'uploaded_by_user_id', d.uploaded_by_user_id,
      'created_at', d.created_at
    ) as attachment_payload,
    case
      when d.document_type_id is not null and d.document_type_code is not null
      then jsonb_build_array(jsonb_build_object(
        'id', d.id,
        'status', 'approved',
        'document_type_id', d.document_type_id,
        'attachment_id', d.id,
        'document_type_code', d.document_type_code,
        'document_type_name', d.document_type_name,
        'file_name', d.file_name,
        'mime_type', d.mime_type,
        'size_bytes', d.size_bytes,
        'bucket', d.bucket,
        'storage_path', d.storage_path
      ))
      else '[]'::jsonb
    end as submission_payload
  from eligible_documents d
)
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
select
  p.organization_id,
  'opportunity',
  p.entity_id,
  'opportunity.won',
  jsonb_set(
    jsonb_set(
      p.base_payload,
      '{attachments}',
      jsonb_build_array(p.attachment_payload),
      true
    ),
    '{document_submissions}',
    p.submission_payload,
    true
  ) || jsonb_build_object(
    '_replay', jsonb_build_object(
      'replay', true,
      'replay_reason', 'historical_document_backfill',
      'document_id', p.id,
      'requested_at', now()
    )
  ),
  'seialz:opportunity.won:' || p.organization_id::text || ':' ||
    p.entity_id::text || ':replay:document:' || p.id::text,
  now(),
  'pending'
from backfill_payloads p
on conflict (idempotency_key) do nothing;
