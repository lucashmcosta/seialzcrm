create or replace function public.fn_enqueue_nammux_contact_document_v1(_document_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  d public.documents%rowtype;
  v_opp uuid;
  v_payload jsonb;
  v_attachment jsonb;
  v_submission jsonb := '[]'::jsonb;
  v_dt public.document_types%rowtype;
  v_count integer := 0;
begin
  select * into d from public.documents where id = _document_id;
  if not found or d.entity_type <> 'contact' or d.deleted_at is not null
     or coalesce(d.is_sample, false) or coalesce(d.external_source, '') = 'suvsign' then
    return 0;
  end if;

  if not exists (
    select 1 from public.organization_integrations oi
    join public.admin_integrations ai on ai.id = oi.integration_id
    where oi.organization_id = d.organization_id and ai.slug = 'nammux' and oi.is_enabled = true
      and lower(coalesce(oi.config_values->>'enabled','true')) in ('true','1','yes','on')
      and lower(coalesce(oi.config_values->>'send_opportunity_won','true')) in ('true','1','yes','on')
      and lower(coalesce(oi.config_values->>'include_opportunity_attachments','true')) in ('true','1','yes','on')
  ) or not exists (
    select 1 from public.integration_subscriptions s
    where s.organization_id = d.organization_id and s.integration_slug = 'nammux'
      and s.event_type = 'opportunity.won' and s.target_action = 'send_opportunity_won' and s.is_active = true
  ) then
    return 0;
  end if;

  v_attachment := jsonb_build_object(
    'id', d.id, 'entity_type', d.entity_type, 'entity_id', d.entity_id, 'bucket', d.bucket,
    'storage_path', d.storage_path, 'file_name', d.file_name, 'mime_type', d.mime_type,
    'size_bytes', d.size_bytes, 'uploaded_by_user_id', d.uploaded_by_user_id, 'created_at', d.created_at);

  if d.document_type_id is not null then
    select * into v_dt from public.document_types
    where id = d.document_type_id and organization_id = d.organization_id and deleted_at is null;
    if found then
      v_submission := jsonb_build_array(jsonb_build_object(
        'id', d.id, 'status', 'approved', 'document_type_id', d.document_type_id, 'attachment_id', d.id,
        'document_type_code', v_dt.code, 'document_type_name', v_dt.name, 'file_name', d.file_name,
        'mime_type', d.mime_type, 'size_bytes', d.size_bytes, 'bucket', d.bucket, 'storage_path', d.storage_path));
    end if;
  end if;

  for v_opp in
    select o.id from public.opportunities o
    join public.pipeline_stages ps on ps.id = o.pipeline_stage_id and ps.type = 'won'
    where o.contact_id = d.entity_id and o.organization_id = d.organization_id and o.deleted_at is null
      and exists (
        select 1 from public.integration_events ie
        join public.integration_jobs ij on ij.event_id = ie.id and ij.organization_id = d.organization_id
          and ij.integration_slug = 'nammux' and ij.target_action = 'send_opportunity_won' and ij.status = 'success'
        where ie.organization_id = d.organization_id and ie.aggregate_type = 'opportunity'
          and ie.aggregate_id = o.id and ie.event_type = 'opportunity.won')
  loop
    v_payload := public.fn_build_opportunity_won_payload(v_opp);
    v_payload := jsonb_set(v_payload, '{attachments}', jsonb_build_array(v_attachment), true);
    v_payload := jsonb_set(v_payload, '{document_submissions}', v_submission, true);
    v_payload := v_payload || jsonb_build_object('_replay', jsonb_build_object(
      'replay', true, 'replay_reason', 'contact_document_added_after_win',
      'document_id', d.id, 'requested_at', now()));

    insert into public.integration_events (organization_id, aggregate_type, aggregate_id, event_type,
      payload, idempotency_key, occurred_at, status)
    values (d.organization_id, 'opportunity', v_opp, 'opportunity.won', v_payload,
      'seialz:opportunity.won:' || d.organization_id::text || ':' || v_opp::text || ':replay:document:' || d.id::text,
      now(), 'pending')
    on conflict (idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.fn_enqueue_nammux_contact_document_v1(uuid) from public, anon, authenticated;
grant execute on function public.fn_enqueue_nammux_contact_document_v1(uuid) to service_role;

create or replace function public.fn_emit_nammux_contact_document_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.entity_type = 'contact' then
    perform public.fn_enqueue_nammux_contact_document_v1(new.id);
  end if;
  return new;
exception when others then
  raise warning 'nammux contact document enqueue failed for document %: %', new.id, sqlerrm;
  return new;
end;
$function$;

revoke all on function public.fn_emit_nammux_contact_document_v1() from public, anon, authenticated;
grant execute on function public.fn_emit_nammux_contact_document_v1() to service_role;

drop trigger if exists trg_emit_nammux_contact_document_v1 on public.documents;
create trigger trg_emit_nammux_contact_document_v1
after insert on public.documents
for each row execute function public.fn_emit_nammux_contact_document_v1();

comment on trigger trg_emit_nammux_contact_document_v1 on public.documents is
  'Queues contact (non-SuvSign) documents to every won opportunity of the contact already delivered to Nammux.';