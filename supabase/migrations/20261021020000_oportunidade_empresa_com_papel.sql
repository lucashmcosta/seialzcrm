-- Vinculo entre oportunidade e empresa, COM PAPEL.
--
-- Hoje existe `opportunities.company_id`, uma chave solta: diz que a
-- oportunidade tem a ver com a empresa, mas nao diz COMO. Num CRM, company_id
-- costuma significar "a empresa do cliente"; em causa trabalhista a empresa e
-- a parte CONTRARIA. Encher o mesmo campo com os dois sentidos faz qualquer
-- relatorio mentir -- e por isso, de 35.593 oportunidades, nenhuma esta
-- vinculada: o campo nao serve para o que se precisa dele.
--
-- E nao e uma empresa so. Terceirizacao poe DUAS no polo passivo
-- (empregadora e tomadora), e ainda ha as do mesmo grupo. Uma chave nao
-- guarda isso.
--
-- UNIVERSAL, NAO DA CENTRAL TRABALHISTA. Os papeis sao CATALOGO POR
-- ORGANIZACAO, no mesmo padrao de `document_types` (linha com
-- organization_id null = padrao global). Nada de enum com "empregadora"
-- cravado no schema: outra organizacao do Seialz define os papeis dela sem
-- migration.

create table if not exists public.opportunity_company_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  -- Papel de parte CONTRARIA. E isto, e nao o nome do papel, que decide o que
  -- vira `papel = 'reu'` do outro lado -- quem integra nao precisa conhecer o
  -- vocabulario de cada organizacao.
  is_counterparty boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint opportunity_company_roles_code_unico unique (organization_id, code)
);

create table if not exists public.opportunity_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role_code text not null,
  -- De onde veio o vinculo: digitado, lido de um documento, importado.
  source text not null default 'manual',
  source_document_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint opportunity_companies_unico unique (opportunity_id, company_id, role_code)
);

create index if not exists opportunity_companies_por_oportunidade
  on public.opportunity_companies(opportunity_id);
create index if not exists opportunity_companies_por_empresa
  on public.opportunity_companies(company_id);

comment on table public.opportunity_companies is
  'Empresas ligadas a uma oportunidade, cada uma com o seu papel. Substitui o sentido ambiguo '
  'de opportunities.company_id, que nao diz se a empresa e do cliente ou e a parte contraria.';
comment on column public.opportunity_company_roles.is_counterparty is
  'Papel de parte contraria. Decide o que vira polo passivo na integracao, sem que o integrador '
  'precise conhecer o vocabulario de cada organizacao.';

alter table public.opportunity_company_roles enable row level security;
alter table public.opportunity_companies      enable row level security;

drop policy if exists opportunity_company_roles_select on public.opportunity_company_roles;
create policy opportunity_company_roles_select on public.opportunity_company_roles
  for select to authenticated
  using (organization_id is null or public.user_has_org_access(organization_id));

drop policy if exists opportunity_companies_select on public.opportunity_companies;
create policy opportunity_companies_select on public.opportunity_companies
  for select to authenticated
  using (public.user_has_org_access(organization_id));

revoke all on public.opportunity_company_roles from public, anon;
revoke all on public.opportunity_companies      from public, anon;
grant select on public.opportunity_company_roles to authenticated;
grant select on public.opportunity_companies      to authenticated;
grant all on public.opportunity_company_roles to service_role;
grant all on public.opportunity_companies      to service_role;

-- Padroes GLOBAIS: genericos de proposito, servem para qualquer organizacao.
insert into public.opportunity_company_roles (organization_id, code, name, is_counterparty, sort_order)
select null, v.code, v.name, v.contra, v.ord
  from (values
    ('counterparty',   'Parte contrária',    true,  10),
    ('client_company', 'Empresa do cliente', false, 20)
  ) as v(code, name, contra, ord)
 where not exists (
   select 1 from public.opportunity_company_roles r
    where r.organization_id is null and r.code = v.code);

-- O tipo de documento declara que vale procurar CNPJ nele. Assim nao existe
-- `if code = 'CTPS'` em codigo: outra organizacao liga no documento dela.
alter table public.document_types
  add column if not exists scans_cnpj boolean not null default false;

comment on column public.document_types.scans_cnpj is
  'Documento em que vale procurar CNPJ para sugerir vinculo de empresa. Por organizacao: '
  'na Central Trabalhista e a CTPS, que traz o historico de empregos; em outra pode ser outro.';
