-- ============================================================
-- Módulo de Documentos — ETAPA 2a: catálogo visível + habilitação
-- Projeto: qvmtzfvkhkhkhdpclzua
--
-- Corrige a regressão da Etapa 1: o seletor de tipos ficou vazio porque o FE
-- filtra document_types por organization_id=org, mas o catálogo é global
-- (org_id NULL). Aqui damos policies à tabela de habilitação e semeamos quais
-- categorias cada org enxerga; o FE passa a ler o catálogo via essa tabela.
--
-- Aditivo/reversível (DOWN em supabase/rollback). Aplicada por MCP.
-- ============================================================

-- 1) RLS em organization_document_types (hoje: RLS on, 0 policy = deny-all).
--    Membro da org lê; só admin (super ou org-admin) escreve. Espelha o padrão
--    de intelligence_settings.
create policy "org_document_types select members"
  on public.organization_document_types for select to authenticated
  using (organization_id = any (current_user_org_ids()));

create policy "org_document_types insert admins"
  on public.organization_document_types for insert to authenticated
  with check (is_admin_user() or is_org_admin(organization_id));

create policy "org_document_types update admins"
  on public.organization_document_types for update to authenticated
  using (is_admin_user() or is_org_admin(organization_id))
  with check (is_admin_user() or is_org_admin(organization_id));

create policy "org_document_types delete admins"
  on public.organization_document_types for delete to authenticated
  using (is_admin_user() or is_org_admin(organization_id));

-- 2) Seed de habilitação por categoria (data-driven; sem hardcode de UUID).
--    Base: TODAS as orgs. Trabalhista: Central Trabalhista. Aéreo: Viagi.
--    on conflict do nothing => idempotente e não sobrescreve curadoria manual.

-- 2.1 Base (todas as orgs)
insert into public.organization_document_types (organization_id, document_type_id)
select o.id, dt.id
from public.organizations o
cross join public.document_types dt
where dt.organization_id is null and dt.deleted_at is null and dt.is_active
  and dt.category_code in (
    'IDENTIFICACAO','ENDERECO','REPRESENTACAO','TRIAGEM','CONTRATACAO',
    'FINANCEIRO','PARCERIA','SAUDE','PREVIDENCIARIO_FISCAL','PROVA','OUTROS')
on conflict do nothing;

-- 2.2 + Trabalhista (Central Trabalhista)
insert into public.organization_document_types (organization_id, document_type_id)
select o.id, dt.id
from public.organizations o
cross join public.document_types dt
where o.name = 'Central Trabalhista'
  and dt.organization_id is null and dt.deleted_at is null and dt.is_active
  and dt.category_code in ('VINCULO','REMUNERACAO','JORNADA','RESCISAO','PARTE_CONTRARIA')
on conflict do nothing;

-- 2.3 + Aéreo (Viagi — pode haver mais de uma org 'Viagi')
insert into public.organization_document_types (organization_id, document_type_id)
select o.id, dt.id
from public.organizations o
cross join public.document_types dt
where o.name = 'Viagi'
  and dt.organization_id is null and dt.deleted_at is null and dt.is_active
  and dt.category_code in ('VIAGEM','OCORRENCIA_VOO','DANOS_DESPESAS','ATENDIMENTO')
on conflict do nothing;

-- Assert defensivo: Central Trabalhista e Viagi têm habilitação > base.
do $$
declare v_ct int; v_viagi int;
begin
  select count(*) into v_ct from public.organization_document_types odt
    join public.organizations o on o.id=odt.organization_id where o.name='Central Trabalhista';
  select count(*) into v_viagi from public.organization_document_types odt
    join public.organizations o on o.id=odt.organization_id where o.name='Viagi';
  if v_ct = 0 then raise exception 'E2a: Central Trabalhista sem habilitação'; end if;
  if v_viagi = 0 then raise exception 'E2a: Viagi sem habilitação'; end if;
end $$;

select pg_notify('pgrst', 'reload schema');
