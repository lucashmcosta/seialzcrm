-- ROLLBACK Etapa 1 (20260811120000_documents_module_e1). Reverte a fundação
-- do módulo de Documentos, sem perder dados. Restaura entity_type/document_type_id
-- dos 19 registros tocados a partir de public._documents_e1_backup.
-- NÃO mexe nas views de compat attachments/document_submissions (não fazem parte da Etapa 1).

begin;

-- 1) Restaurar os dados mutados (11 contact_document normalizados + 15 tipados remapeados).
update public.documents d
   set entity_type = b.entity_type,
       document_type_id = b.document_type_id
  from public._documents_e1_backup b
 where b.id = d.id;

-- 2) Reativar os 5 tipos legados por org e apagar o catálogo global (era 0 antes).
update public.document_types
   set is_active = true, deleted_at = null
 where organization_id is not null
   and code in ('rg','comprovante','Folha Pgto','rescisao');

delete from public.document_types where organization_id is null;

-- 3) Habilitação por tenant.
drop table if exists public.organization_document_types;

-- 4) documents: dropar a view canônica (depende das colunas via select *), depois
--    is_current (gerada), índices novos e colunas novas.
drop view if exists public.documents_current;
drop index if exists public.documents_single_current_uk;
drop index if exists public.documents_hash_uk;
drop index if exists public.documents_pendencia_idx;
drop index if exists public.documents_expires_idx;
drop index if exists public.documents_superseded_by_uk;
drop index if exists public.documents_historico_idx;
drop index if exists public.documents_external_uk;

alter table public.documents drop column if exists is_current;
alter table public.documents
  drop column if exists content_hash,
  drop column if exists reference_date,
  drop column if exists reference_end_date,
  drop column if exists reference_month,
  drop column if exists expires_at,
  drop column if exists original_file_name,
  drop column if exists display_name,
  drop column if exists both_sides_in_file,
  drop column if exists is_incomplete,
  drop column if exists version,
  drop column if exists superseded_by_id,
  drop column if exists superseded_at,
  drop column if exists root_document_id,
  drop column if exists external_source,
  drop column if exists external_ref,
  drop column if exists is_single;
-- storage_path é pré-existente (não dropar).

-- 5) Recriar o unique da Fase 1 (destravado no UP).
create unique index if not exists documents_entity_type_uq
  on public.documents (entity_id, document_type_id)
  where document_type_id is not null and deleted_at is null;

-- 6) document_types: remover CHECKs, índices e colunas novos; restaurar NOT NULL e RLS antiga.
alter table public.document_types
  drop constraint if exists document_types_category_chk,
  drop constraint if exists document_types_owner_type_chk,
  drop constraint if exists document_types_cardinality_chk,
  drop constraint if exists document_types_reference_kind_chk,
  drop constraint if exists document_types_validity_mode_chk,
  drop constraint if exists document_types_validity_days_chk,
  drop constraint if exists document_types_validity_stated_chk,
  drop constraint if exists document_types_reference_cardinality_chk,
  drop constraint if exists document_types_two_sides_chk;

drop index if exists public.document_types_code_global_uk;
drop index if exists public.document_types_code_org_uk;

alter table public.document_types
  drop column if exists category_code,
  drop column if exists owner_type,
  drop column if exists cardinality,
  drop column if exists reference_kind,
  drop column if exists validity_mode,
  drop column if exists validity_days,
  drop column if exists has_two_sides,
  drop column if exists is_syncable;

alter table public.document_types alter column organization_id set not null;

drop policy if exists "document_types select org members" on public.document_types;
create policy "document_types select org members"
  on public.document_types for select to authenticated
  using (organization_id = any (current_user_org_ids()));

-- 7) Backup temporário.
drop table if exists public._documents_e1_backup;

select pg_notify('pgrst', 'reload schema');
commit;
