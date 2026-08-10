-- Fase 1 — Padronização de Documentos: renomear attachments -> documents + classificar (document_type_id)
-- + migrar document_submissions para dentro de documents. NÃO-DESTRUTIVO e REVERSÍVEL (ver _down).
--
-- Estratégia de menor risco: como storage policies, RPCs (fn_build_opportunity_won_payload,
-- list_entity_documents_v1) e o front referenciam `attachments`/`document_submissions` POR NOME,
-- mantemos VIEWS de compatibilidade (security_invoker) com esses nomes apontando para `documents`.
-- Assim nada precisa ser editado para continuar funcionando (Nammux inclusive). O rename fica um
-- "alias", e migramos as referências para `documents` depois, sem pressa.
--
-- Contexto de dados (prod): documents(=attachments) ~4.775 arquivos ativos; document_submissions ~10 linhas
-- (contact-only). Logos/avatars NÃO estão nesta tabela (vivem em colunas *_url + bucket) — nada a separar.

begin;

-- 0) Backup da tabela para rollback exato (temporária; removida na Fase 3).
create table if not exists public._document_submissions_backup_phase1 as table public.document_submissions;

-- 1) Renomear a tabela física. As RLS policies da tabela acompanham o rename.
alter table public.attachments rename to documents;

-- 2) Classificação: 1 coluna. É o único vestígio no banco do "slot" (o resto é derivado no front).
alter table public.documents add column if not exists document_type_id uuid references public.document_types(id);

-- 3) Migrar as submissions para dentro de documents (não perder nada): setar o tipo no próprio arquivo.
update public.documents d
   set document_type_id = ds.document_type_id
  from public.document_submissions ds
 where ds.attachment_id = d.id and ds.deleted_at is null;

-- Unicidade: 1 documento classificado por (entidade, tipo). Espelha o unique antigo (contact,type).
create unique index if not exists documents_entity_type_uq
  on public.documents (entity_id, document_type_id)
  where document_type_id is not null and deleted_at is null;

-- 4) View de compatibilidade com o nome antigo `attachments` (security_invoker => RLS da `documents`
--    aplicada ao usuário chamador). Mantém FE (.from('attachments')), storage policies (EXISTS ... FROM
--    attachments) e edge (nammux-download-attachment) funcionando sem edição. É auto-updatable
--    (select * de tabela simples), então insert/update/delete via PostgREST seguem funcionando.
create view public.attachments with (security_invoker = true) as
  select * from public.documents;

-- 5) Substituir a TABELA document_submissions por uma VIEW sobre documents (dados já migrados no passo 3).
--    Mantém `fn_build_opportunity_won_payload` (filtra status='approved') e `list_entity_documents_v1`
--    compilando sem edição. Aprovação foi removida (decisão do usuário) => status é sempre 'approved',
--    logo o Nammux passa a receber TODOS os documentos classificados (mudança de comportamento intencional).
alter publication supabase_realtime drop table public.document_submissions;
drop table public.document_submissions;

create view public.document_submissions with (security_invoker = true) as
  select
    d.id                                   as id,
    d.organization_id                      as organization_id,
    d.entity_id                            as contact_id,
    d.document_type_id                     as document_type_id,
    d.id                                   as attachment_id,
    'approved'::text                       as status,
    d.uploaded_by_user_id                  as uploaded_by_user_id,
    d.created_at                           as uploaded_at,
    null::uuid                             as reviewed_by_user_id,
    null::timestamptz                      as reviewed_at,
    null::text                             as rejection_reason,
    d.deleted_at                           as deleted_at,
    d.created_at                           as created_at,
    d.created_at                           as updated_at
  from public.documents d
  where d.document_type_id is not null
    and d.entity_type in ('contact', 'contact_document')
    and d.deleted_at is null;

-- 6) Realtime: `documents` (a tabela real, antes `attachments`, não estava na publicação) entra;
--    o front novo passa a ouvir `documents`.
alter publication supabase_realtime add table public.documents;

-- Nota: NÃO normalizamos entity_type='contact_document' -> 'contact' nesta fase (as views tratam ambos),
-- para reduzir superfície de mudança. Normalização e drop das views ficam para a Fase 3, após paridade.

select pg_notify('pgrst', 'reload schema');
commit;
