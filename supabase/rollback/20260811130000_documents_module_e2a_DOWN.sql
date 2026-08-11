-- ROLLBACK Etapa 2a. Remove policies de organization_document_types e a habilitação
-- semeada. A tabela estava VAZIA antes da 2a, então limpar tudo é seguro.

begin;

drop policy if exists "org_document_types select members" on public.organization_document_types;
drop policy if exists "org_document_types insert admins" on public.organization_document_types;
drop policy if exists "org_document_types update admins" on public.organization_document_types;
drop policy if exists "org_document_types delete admins" on public.organization_document_types;

delete from public.organization_document_types;

select pg_notify('pgrst', 'reload schema');
commit;
