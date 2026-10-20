-- Configuracao da CENTRAL TRABALHISTA, nao do produto.
--
-- A estrutura (opportunity_companies + catalogo de papeis + document_types.
-- scans_cnpj) e universal e esta na migration. Isto aqui e o vocabulario de
-- UMA organizacao: por isso e script de manutencao, e nao migration -- outra
-- organizacao do Seialz configura o dela sem ninguem mexer no schema.
--
-- Os tres papeis saem da propria ficha de entrevista do escritorio, secao 3:
-- "Empregadora", "Trabalhava terceirizado? Tomadora" e "Outras empresas do
-- mesmo grupo ou dos mesmos socios". Os tres sao polo passivo.

insert into public.opportunity_company_roles
  (organization_id, code, name, is_counterparty, sort_order)
select '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid, v.code, v.name, true, v.ord
  from (values
    ('empregadora',     'Empregadora',            10),
    ('tomadora',        'Tomadora de serviços',   20),
    ('grupo_economico', 'Mesmo grupo econômico',  30)
  ) as v(code, name, ord)
 where not exists (
   select 1 from public.opportunity_company_roles r
    where r.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
      and r.code = v.code);

-- Na CT, quem traz CNPJ e a CTPS: ela e o historico de empregos inteiro, com
-- varias empresas. Por isso a tela PERGUNTA qual e a do caso, em vez de
-- adivinhar -- o documento nao diz, so a pessoa sabe.
update public.document_types
   set scans_cnpj = true, updated_at = now()
 where code = 'CTPS'
   and (organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f' or organization_id is null)
   and scans_cnpj is distinct from true;

select r.code, r.name, r.is_counterparty,
       coalesce(r.organization_id::text, '(global)') as escopo
  from public.opportunity_company_roles r order by r.organization_id nulls first, r.sort_order;

-- ===== Segunda rodada: o papel padrao =====
-- "Reclamada" e como o escritorio chama a parte contraria no processo
-- trabalhista. E o que a tela aplica com um clique; empregadora, tomadora e
-- grupo continuam no catalogo para quando a distincao importar (a secao 3 da
-- ficha de entrevista pergunta por elas).

insert into public.opportunity_company_roles
  (organization_id, code, name, is_counterparty, sort_order, is_default)
select '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid, 'reclamada', 'Reclamada', true, 5, true
 where not exists (
   select 1 from public.opportunity_company_roles
    where organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f' and code = 'reclamada');
