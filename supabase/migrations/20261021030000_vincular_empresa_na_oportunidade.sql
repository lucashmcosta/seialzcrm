-- Vincular uma empresa a uma oportunidade, criando-a se ainda nao existir.
--
-- Idempotente nos dois niveis: a empresa e procurada pelo CNPJ dentro da
-- organizacao antes de criar, e o vinculo tem chave unica. Duas pessoas
-- escolhendo a mesma empresa ao mesmo tempo nao criam duas.
--
-- Os dados cadastrais vem da consulta oficial feita por quem chamou (o
-- `registry-lookup`), nao de leitura de documento: documento da o CNPJ, a
-- Receita da o resto.

create or replace function public.oportunidade_vincular_empresa_v1(
  _opportunity_id uuid,
  _cnpj text,
  _role_code text,
  _dados jsonb default '{}'::jsonb,
  _source text default 'manual',
  _source_document_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_cnpj text := regexp_replace(coalesce(_cnpj,''), '\D', '', 'g');
  v_company uuid;
  v_papel public.opportunity_company_roles%rowtype;
begin
  if auth.uid() is null then raise exception 'EMPRESA_SEM_USUARIO'; end if;
  if length(v_cnpj) <> 14 then raise exception 'EMPRESA_CNPJ_INVALIDO'; end if;

  select organization_id into v_org from public.opportunities where id = _opportunity_id;
  if v_org is null then raise exception 'EMPRESA_OPORTUNIDADE_NAO_ENCONTRADA'; end if;
  if not public.user_has_org_access(v_org) then raise exception 'EMPRESA_SEM_ACESSO'; end if;

  -- O papel precisa existir no catalogo: global ou da propria organizacao.
  select * into v_papel from public.opportunity_company_roles
   where code = _role_code and is_active
     and (organization_id = v_org or organization_id is null)
   order by (organization_id is not null) desc limit 1;
  if v_papel.id is null then raise exception 'EMPRESA_PAPEL_DESCONHECIDO'; end if;

  select id into v_company from public.companies
   where organization_id = v_org
     and regexp_replace(coalesce(cnpj,''), '\D', '', 'g') = v_cnpj
     and deleted_at is null
   limit 1;

  if v_company is null then
    insert into public.companies (
      organization_id, name, cnpj, legal_name, trade_name,
      registration_status, opened_at, legal_nature, company_size,
      primary_cnae_code, primary_cnae_description, phone, email,
      address_street, address_number, address_complement, address_neighborhood,
      address_city, address_state, address_zip, source
    ) values (
      v_org,
      coalesce(nullif(_dados->>'trade_name',''), nullif(_dados->>'legal_name',''), v_cnpj),
      v_cnpj,
      nullif(_dados->>'legal_name',''), nullif(_dados->>'trade_name',''),
      nullif(_dados->>'registration_status',''),
      nullif(_dados->>'opened_at','')::date,
      nullif(_dados->>'legal_nature',''), nullif(_dados->>'company_size',''),
      nullif(_dados->>'primary_cnae_code',''), nullif(_dados->>'primary_cnae_description',''),
      nullif(_dados->>'phone',''), nullif(_dados->>'email',''),
      nullif(_dados->>'address_street',''), nullif(_dados->>'address_number',''),
      nullif(_dados->>'address_complement',''), nullif(_dados->>'address_neighborhood',''),
      nullif(_dados->>'address_city',''), nullif(_dados->>'address_state',''),
      nullif(_dados->>'address_zip',''),
      coalesce(_source, 'manual')
    ) returning id into v_company;
  end if;

  insert into public.opportunity_companies
    (organization_id, opportunity_id, company_id, role_code, source, source_document_id, created_by)
  values (v_org, _opportunity_id, v_company, v_papel.code, coalesce(_source,'manual'),
          _source_document_id, auth.uid())
  on conflict (opportunity_id, company_id, role_code) do nothing;

  return (select jsonb_build_object(
            'company_id', c.id, 'name', c.name, 'cnpj', c.cnpj,
            'legal_name', c.legal_name, 'role_code', v_papel.code, 'role_name', v_papel.name)
            from public.companies c where c.id = v_company);
end;
$$;

revoke all on function public.oportunidade_vincular_empresa_v1(uuid, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.oportunidade_vincular_empresa_v1(uuid, text, text, jsonb, text, uuid) to authenticated, service_role;

-- Desfazer um vinculo: escolher errado tem que ter conserto na propria tela.
create or replace function public.oportunidade_desvincular_empresa_v1(_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.opportunity_companies where id = _id;
  if v_org is null then return false; end if;
  if not public.user_has_org_access(v_org) then raise exception 'EMPRESA_SEM_ACESSO'; end if;
  delete from public.opportunity_companies where id = _id;
  return true;
end;
$$;

revoke all on function public.oportunidade_desvincular_empresa_v1(uuid) from public, anon;
grant execute on function public.oportunidade_desvincular_empresa_v1(uuid) to authenticated, service_role;
