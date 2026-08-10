-- ROLLBACK da Fase 1 (20260810230000_documents_rename_phase1). Reverte tudo, sem perder dados.
-- Aplicar manualmente se precisar reverter. Restaura `document_submissions` a partir do backup.

begin;

-- 1) Remover as views de compatibilidade.
drop view if exists public.document_submissions;
drop view if exists public.attachments;

-- 2) Realtime: tirar documents.
alter publication supabase_realtime drop table public.documents;

-- 3) Renomear de volta documents -> attachments (RLS da tabela acompanha).
alter table public.documents rename to attachments;

-- 4) Remover índice de classificação + coluna.
drop index if exists public.documents_entity_type_uq;
alter table public.attachments drop column if exists document_type_id;

-- 5) Restaurar a TABELA document_submissions a partir do backup (dados idênticos aos originais).
alter table public._document_submissions_backup_phase1 rename to document_submissions;

-- 5a) Reconstituir integridade/segurança (mesma DDL de 20260604213409).
alter table public.document_submissions
  add primary key (id);
alter table public.document_submissions alter column id set default gen_random_uuid();
alter table public.document_submissions
  add constraint document_submissions_status_check check (status in ('uploaded','approved','rejected'));
create unique index if not exists document_submissions_contact_type_unique
  on public.document_submissions (contact_id, document_type_id) where deleted_at is null;
create index if not exists document_submissions_org_contact_idx
  on public.document_submissions (organization_id, contact_id) where deleted_at is null;
create index if not exists document_submissions_org_status_idx
  on public.document_submissions (organization_id, status) where deleted_at is null;

alter table public.document_submissions enable row level security;
create policy "document_submissions select org members" on public.document_submissions
  for select to authenticated using (organization_id = any (current_user_org_ids()));
create policy "document_submissions insert org members" on public.document_submissions
  for insert to authenticated with check (
    organization_id = any (current_user_org_ids())
    and uploaded_by_user_id = current_user_id()
    and exists (select 1 from public.contacts c where c.id = contact_id and c.organization_id = document_submissions.organization_id)
    and exists (select 1 from public.document_types dt where dt.id = document_type_id and dt.organization_id = document_submissions.organization_id and dt.deleted_at is null)
    and exists (select 1 from public.attachments a where a.id = attachment_id and a.organization_id = document_submissions.organization_id and a.entity_type = 'contact_document' and a.entity_id = contact_id and a.deleted_at is null)
  );
create policy "document_submissions update reviewers" on public.document_submissions
  for update to authenticated
  using (organization_id = any (current_user_org_ids()) and can_review_contact_documents(contact_id))
  with check (
    organization_id = any (current_user_org_ids()) and can_review_contact_documents(contact_id)
    and exists (select 1 from public.document_types dt where dt.id = document_type_id and dt.organization_id = document_submissions.organization_id and dt.deleted_at is null)
    and exists (select 1 from public.attachments a where a.id = attachment_id and a.organization_id = document_submissions.organization_id and a.entity_type = 'contact_document' and a.entity_id = contact_id and a.deleted_at is null)
  );
create policy "document_submissions delete reviewers" on public.document_submissions
  for delete to authenticated
  using (organization_id = any (current_user_org_ids()) and can_review_contact_documents(contact_id));

-- updated_at trigger (reutiliza a função existente do projeto).
create trigger document_submissions_set_updated_at before update on public.document_submissions
  for each row execute function public.update_updated_at_column();

-- 6) Realtime: recolocar document_submissions.
alter publication supabase_realtime add table public.document_submissions;

select pg_notify('pgrst', 'reload schema');
commit;
