-- Fase 3a (parte segura, ANTES de dropar) — reaponta o que referencia as views por nome
-- (`attachments`/`document_submissions`) para ler a tabela real `documents` direto.
-- Aditivo/equivalente: as views continuam existindo (não dropamos nada aqui). Depois disso,
-- nada de banco depende mais das views, e o drop (fase seguinte) fica seguro.

-- 1) Storage policies (SELECT/DELETE) — trocam o subquery FROM attachments -> FROM documents.
--    (A policy de INSERT não referencia a tabela; permanece.)
drop policy if exists "Users can view attachments in their org" on storage.objects;
create policy "Users can view attachments in their org" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and exists (
    select 1 from public.documents d
    where d.storage_path = storage.objects.name and public.user_has_org_access(d.organization_id)));

drop policy if exists "Users can delete attachments in their org" on storage.objects;
create policy "Users can delete attachments in their org" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and exists (
    select 1 from public.documents d
    where d.storage_path = storage.objects.name and public.user_has_org_access(d.organization_id)));

-- 2) fn_build_opportunity_won_payload — lê `documents` direto (subs = documents com tipo; status
--    constante 'approved', pois aprovação foi removida). Saída equivalente ao contrato atual.
create or replace function public.fn_build_opportunity_won_payload(_opportunity_id uuid)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with op as (
    select o.* from public.opportunities o where o.id = _opportunity_id
  ),
  contact_payload as (
    select public.fn_build_nammux_contact_payload(op.contact_id) value from op
  ),
  att as (
    select distinct on (a.id)
      a.id, a.entity_type, a.entity_id, a.bucket, a.storage_path,
      a.file_name, a.mime_type, a.size_bytes, a.uploaded_by_user_id, a.created_at
    from public.documents a, op
    where a.deleted_at is null
      and (
        (a.entity_type = 'opportunity' and a.entity_id = op.id)
        or (a.entity_type = 'contact' and a.entity_id = op.contact_id)
      )
  ),
  subs as (
    select
      d.id, 'approved'::text as status, d.document_type_id, d.id as attachment_id,
      dt.code as document_type_code, dt.name as document_type_name,
      d.file_name, d.mime_type, d.size_bytes, d.bucket, d.storage_path
    from public.documents d
    join op on op.contact_id = d.entity_id
    join public.document_types dt on dt.id = d.document_type_id
    where d.document_type_id is not null
      and d.entity_type in ('contact', 'contact_document')
      and d.deleted_at is null
  )
  select jsonb_build_object(
    'schema_version', 2,
    'event_version', '2.0',
    'source', 'seialz_crm',
    'organization_id', op.organization_id,
    'opportunity', jsonb_build_object(
      'id', op.id, 'title', op.title, 'amount', op.amount, 'currency', op.currency,
      'status', op.status, 'pipeline_stage_id', op.pipeline_stage_id,
      'close_date', op.close_date, 'owner_user_id', op.owner_user_id
    ),
    'contact', contact_payload.value,
    'attachments', coalesce((select jsonb_agg(to_jsonb(att.*) order by att.created_at) from att), '[]'::jsonb),
    'document_submissions', coalesce((select jsonb_agg(to_jsonb(subs.*)) from subs), '[]'::jsonb)
  )
  from op, contact_payload;
$function$;

-- 3) list_entity_documents_v1 — lê `documents` direto (origin/checklist derivado de document_type_id).
create or replace function public.list_entity_documents_v1(_organization_id uuid, _contact_id uuid default null::uuid, _opportunity_id uuid default null::uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_contact_id uuid := _contact_id; v_result jsonb;
begin
  if auth.role() <> 'service_role' and not (_organization_id = any(public.current_user_org_ids())) then
    raise exception 'forbidden_organization' using errcode = '42501';
  end if;
  if _opportunity_id is not null then
    select contact_id into v_contact_id from public.opportunities
    where id = _opportunity_id and organization_id = _organization_id and deleted_at is null;
    if not found then raise exception 'opportunity_not_found' using errcode = 'P0002'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type,
    'size_bytes', a.size_bytes, 'bucket', a.bucket, 'storage_path', a.storage_path,
    'created_at', a.created_at, 'entity_id', a.entity_id, 'entity_type', a.entity_type,
    'scope', case when a.entity_type = 'opportunity' then 'opportunity' else 'contact' end,
    'origin', case when a.document_type_id is not null then 'checklist'
      when a.entity_type = 'opportunity' then 'opportunity' else 'free' end,
    'document_type_id', a.document_type_id, 'document_type_name', dt.name,
    'workflow_status', case when a.document_type_id is not null then 'approved'::text else null::text end,
    'reviewed_at', null::timestamptz, 'rejection_reason', null::text
  ) order by a.created_at desc), '[]'::jsonb) into v_result
  from public.documents a
  left join public.document_types dt on dt.id = a.document_type_id
  where a.organization_id = _organization_id and a.deleted_at is null
    and (
      (_opportunity_id is not null and a.entity_type = 'opportunity' and a.entity_id = _opportunity_id)
      or (v_contact_id is not null and a.entity_type in ('contact', 'contact_document') and a.entity_id = v_contact_id)
    );
  return v_result;
end;
$function$;

select pg_notify('pgrst', 'reload schema');
