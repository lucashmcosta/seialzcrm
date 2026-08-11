-- ROLLBACK Fase 3a (20260810240000_documents_repoint_phase3a).
-- Reverte o "safe repoint": storage policies (SELECT/DELETE) e as funções
-- fn_build_opportunity_won_payload / list_entity_documents_v1 voltam a referenciar as VIEWS
-- de compatibilidade `attachments` / `document_submissions` (que continuam existindo pós-Fase 1),
-- restaurando byte-a-byte as definições anteriores (v2 de 20260729100000 e a de 20260731180000).
--
-- IMPORTANTE — ORDEM DE ROLLBACK (reverso da aplicação): 3a -> 2 -> 1.
--   Rode ESTE down ANTES do down da Fase 1. Após a Fase 3a essas funções leem `public.documents`
--   direto; o down da Fase 1 renomeia documents->attachments, então as funções precisam voltar a
--   ler os nomes de view ANTES daquele rename, senão passariam a referenciar relação inexistente.
-- NOTA: os edge functions (nammux-download-attachment, suvsign-webhook) foram reapontados para
--   `.from("documents")`; como a view `attachments` = `select * from documents`, eles seguem
--   equivalentes. Para reverter também o código, faça checkout do estado anterior e redeploy.

begin;

-- 1) Storage policies (SELECT/DELETE) -> voltam a ler public.attachments (view).
drop policy if exists "Users can view attachments in their org" on storage.objects;
create policy "Users can view attachments in their org"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments' and
    exists (
      select 1 from public.attachments
      where storage_path = storage.objects.name
      and user_has_org_access(organization_id)
    )
  );

drop policy if exists "Users can delete attachments in their org" on storage.objects;
create policy "Users can delete attachments in their org"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments' and
    exists (
      select 1 from public.attachments
      where storage_path = storage.objects.name
      and user_has_org_access(organization_id)
    )
  );

-- 2) fn_build_opportunity_won_payload -> definição v2 (lê attachments + document_submissions).
create or replace function public.fn_build_opportunity_won_payload(_opportunity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
    from public.attachments a, op
    where a.deleted_at is null
      and (
        (a.entity_type = 'opportunity' and a.entity_id = op.id)
        or (a.entity_type = 'contact' and a.entity_id = op.contact_id)
      )
  ),
  subs as (
    select
      ds.id, ds.status, ds.document_type_id, ds.attachment_id,
      dt.code as document_type_code, dt.name as document_type_name,
      a.file_name, a.mime_type, a.size_bytes, a.bucket, a.storage_path
    from public.document_submissions ds
    join op on op.contact_id = ds.contact_id
    join public.document_types dt on dt.id = ds.document_type_id
    join public.attachments a on a.id = ds.attachment_id and a.deleted_at is null
    where ds.status = 'approved' and ds.deleted_at is null
  )
  select jsonb_build_object(
    'schema_version', 2,
    'event_version', '2.0',
    'source', 'seialz_crm',
    'organization_id', op.organization_id,
    'opportunity', jsonb_build_object(
      'id', op.id,
      'title', op.title,
      'amount', op.amount,
      'currency', op.currency,
      'status', op.status,
      'pipeline_stage_id', op.pipeline_stage_id,
      'close_date', op.close_date,
      'owner_user_id', op.owner_user_id
    ),
    'contact', contact_payload.value,
    'attachments', coalesce((select jsonb_agg(to_jsonb(att.*) order by att.created_at) from att), '[]'::jsonb),
    'document_submissions', coalesce((select jsonb_agg(to_jsonb(subs.*)) from subs), '[]'::jsonb)
  )
  from op, contact_payload;
$$;

-- 3) list_entity_documents_v1 -> definição anterior (lê attachments + document_submissions).
create or replace function public.list_entity_documents_v1(
  _organization_id uuid,
  _contact_id uuid default null,
  _opportunity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_contact_id uuid := _contact_id; v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and not (_organization_id = any(public.current_user_org_ids())) then
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
    'origin', case when ds.id is not null then 'checklist'
      when a.entity_type = 'opportunity' then 'opportunity' else 'free' end,
    'document_type_id', ds.document_type_id, 'document_type_name', dt.name,
    'workflow_status', ds.status, 'reviewed_at', ds.reviewed_at,
    'rejection_reason', ds.rejection_reason
  ) order by a.created_at desc), '[]'::jsonb) into v_result
  from public.attachments a
  left join public.document_submissions ds
    on ds.attachment_id = a.id and ds.deleted_at is null and ds.organization_id = _organization_id
  left join public.document_types dt on dt.id = ds.document_type_id
  where a.organization_id = _organization_id and a.deleted_at is null
    and (
      (_opportunity_id is not null and a.entity_type = 'opportunity' and a.entity_id = _opportunity_id)
      or (v_contact_id is not null and a.entity_type in ('contact', 'contact_document') and a.entity_id = v_contact_id)
    );
  return v_result;
end;
$$;

select pg_notify('pgrst', 'reload schema');
commit;
