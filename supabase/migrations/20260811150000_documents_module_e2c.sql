-- ============================================================
-- Módulo de Documentos — ETAPA 2c: RPC de substituição com referência/vencimento/nome
-- Projeto: qvmtzfvkhkhkhdpclzua
--
-- Estende replace_document_single_v1 com params trailing (DEFAULT NULL) p/ a nova
-- versão carregar reference_date/month/end, expires_at e display_name. Compatível:
-- a versão do FE 2b (9 args) segue chamando via os defaults.
-- ============================================================

-- Remove a assinatura antiga (9 args) e cria a estendida (14 args).
drop function if exists public.replace_document_single_v1(uuid, text, text, text, text, text, bigint, uuid, text);

create or replace function public.replace_document_single_v1(
  _old_id             uuid,
  _content_hash       text,
  _storage_path       text,
  _file_name          text,
  _original_file_name text,
  _mime_type          text,
  _size_bytes         bigint,
  _uploaded_by        uuid,
  _bucket             text default 'attachments',
  _reference_date     date default null,
  _reference_month    date default null,
  _reference_end_date date default null,
  _expires_at         date default null,
  _display_name       text default null
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_old public.documents%rowtype;
  v_new_id uuid := gen_random_uuid();
begin
  select * into v_old from public.documents
   where id = _old_id and deleted_at is null and superseded_by_id is null;
  if not found then
    raise exception 'documento a substituir não encontrado ou não corrente' using errcode = 'P0002';
  end if;

  update public.documents set deleted_at = now() where id = _old_id;

  insert into public.documents (
    id, organization_id, entity_type, entity_id, document_type_id, is_single,
    bucket, storage_path, file_name, original_file_name, display_name,
    mime_type, size_bytes, content_hash,
    reference_date, reference_month, reference_end_date, expires_at,
    uploaded_by_user_id, version, root_document_id
  ) values (
    v_new_id, v_old.organization_id, v_old.entity_type, v_old.entity_id, v_old.document_type_id, v_old.is_single,
    _bucket, _storage_path, _file_name, _original_file_name, _display_name,
    _mime_type, _size_bytes, _content_hash,
    _reference_date, _reference_month, _reference_end_date, _expires_at,
    _uploaded_by, coalesce(v_old.version, 1) + 1, coalesce(v_old.root_document_id, v_old.id)
  );

  update public.documents
     set superseded_by_id = v_new_id, superseded_at = now(), deleted_at = null
   where id = _old_id;

  return v_new_id;
end;
$$;

revoke all on function public.replace_document_single_v1(uuid, text, text, text, text, text, bigint, uuid, text, date, date, date, date, text) from public, anon;
grant execute on function public.replace_document_single_v1(uuid, text, text, text, text, text, bigint, uuid, text, date, date, date, date, text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
