-- ROLLBACK Etapa 2c. Volta replace_document_single_v1 à assinatura da 2b (9 args).
-- Documentos já gravados com referência/vencimento/nome permanecem (são colunas).

begin;

drop function if exists public.replace_document_single_v1(uuid, text, text, text, text, text, bigint, uuid, text, date, date, date, date, text);

create or replace function public.replace_document_single_v1(
  _old_id uuid, _content_hash text, _storage_path text, _file_name text, _original_file_name text,
  _mime_type text, _size_bytes bigint, _uploaded_by uuid, _bucket text default 'attachments'
) returns uuid language plpgsql security invoker set search_path to 'public' as $$
declare v_old public.documents%rowtype; v_new_id uuid := gen_random_uuid();
begin
  select * into v_old from public.documents where id=_old_id and deleted_at is null and superseded_by_id is null;
  if not found then raise exception 'documento a substituir não encontrado ou não corrente' using errcode='P0002'; end if;
  update public.documents set deleted_at=now() where id=_old_id;
  insert into public.documents (id, organization_id, entity_type, entity_id, document_type_id, is_single, bucket, storage_path, file_name, original_file_name, mime_type, size_bytes, content_hash, uploaded_by_user_id, version, root_document_id)
  values (v_new_id, v_old.organization_id, v_old.entity_type, v_old.entity_id, v_old.document_type_id, v_old.is_single, _bucket, _storage_path, _file_name, _original_file_name, _mime_type, _size_bytes, _content_hash, _uploaded_by, coalesce(v_old.version,1)+1, coalesce(v_old.root_document_id, v_old.id));
  update public.documents set superseded_by_id=v_new_id, superseded_at=now(), deleted_at=null where id=_old_id;
  return v_new_id;
end $$;
revoke all on function public.replace_document_single_v1(uuid, text, text, text, text, text, bigint, uuid, text) from public, anon;
grant execute on function public.replace_document_single_v1(uuid, text, text, text, text, text, bigint, uuid, text) to authenticated, service_role;

select pg_notify('pgrst','reload schema');
commit;
