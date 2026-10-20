-- Dois consertos no vinculo de empresa.
--
-- 1. O ENDERECO vinha vazio. A consulta devolve o endereco ANINHADO
--    (`payload.address.street`), e eu lia como se fosse plano
--    (`address_street`). Resultado: empresa criada sem endereco nenhum -- e
--    endereco da reclamada e qualificacao da peticao, nao enfeite.
--
-- 2. Empresa que JA EXISTIA ficava como estava. Agora, se ela existe mas esta
--    sem endereco ou sem razao social, o vinculo aproveita a consulta e
--    completa o que falta. Nunca sobrescreve o que ja tem: dado preenchido a
--    mao por alguem vale mais que consulta automatica.

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
  v_end jsonb := coalesce(_dados->'address', '{}'::jsonb);
  -- aceita aninhado (como a consulta devolve) e plano (como alguem pode mandar)
  v_rua    text := coalesce(nullif(v_end->>'street',''),       nullif(_dados->>'address_street',''));
  v_num    text := coalesce(nullif(v_end->>'number',''),       nullif(_dados->>'address_number',''));
  v_compl  text := coalesce(nullif(v_end->>'complement',''),   nullif(_dados->>'address_complement',''));
  v_bairro text := coalesce(nullif(v_end->>'neighborhood',''), nullif(_dados->>'address_neighborhood',''));
  v_cidade text := coalesce(nullif(v_end->>'city',''),         nullif(_dados->>'address_city',''));
  v_uf     text := coalesce(nullif(v_end->>'region',''),       nullif(_dados->>'address_state',''));
  v_cep    text := coalesce(nullif(v_end->>'postal_code',''),  nullif(_dados->>'address_zip',''));
begin
  if auth.uid() is null then raise exception 'EMPRESA_SEM_USUARIO'; end if;
  if length(v_cnpj) <> 14 then raise exception 'EMPRESA_CNPJ_INVALIDO'; end if;

  select organization_id into v_org from public.opportunities where id = _opportunity_id;
  if v_org is null then raise exception 'EMPRESA_OPORTUNIDADE_NAO_ENCONTRADA'; end if;
  if not public.user_has_org_access(v_org) then raise exception 'EMPRESA_SEM_ACESSO'; end if;

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
      address_city, address_state, address_zip, address_country_code, source
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
      v_rua, v_num, v_compl, v_bairro, v_cidade, v_uf, v_cep, 'BR',
      coalesce(_source, 'manual')
    ) returning id into v_company;
  else
    -- Completa o que falta, sem sobrescrever o que ja tem.
    update public.companies c
       set legal_name    = coalesce(c.legal_name, nullif(_dados->>'legal_name','')),
           trade_name    = coalesce(c.trade_name, nullif(_dados->>'trade_name','')),
           registration_status = coalesce(c.registration_status, nullif(_dados->>'registration_status','')),
           legal_nature  = coalesce(c.legal_nature, nullif(_dados->>'legal_nature','')),
           company_size  = coalesce(c.company_size, nullif(_dados->>'company_size','')),
           primary_cnae_code = coalesce(c.primary_cnae_code, nullif(_dados->>'primary_cnae_code','')),
           primary_cnae_description = coalesce(c.primary_cnae_description, nullif(_dados->>'primary_cnae_description','')),
           phone         = coalesce(c.phone, nullif(_dados->>'phone','')),
           email         = coalesce(c.email, nullif(_dados->>'email','')),
           address_street = coalesce(c.address_street, v_rua),
           address_number = coalesce(c.address_number, v_num),
           address_complement = coalesce(c.address_complement, v_compl),
           address_neighborhood = coalesce(c.address_neighborhood, v_bairro),
           address_city  = coalesce(c.address_city, v_cidade),
           address_state = coalesce(c.address_state, v_uf),
           address_zip   = coalesce(c.address_zip, v_cep),
           updated_at    = now()
     where c.id = v_company;
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
