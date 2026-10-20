-- Um papel PADRAO por organizacao, para a tela nao perguntar o obvio.
--
-- A estrutura de papeis continua: tomadora e grupo economico existem de
-- verdade e a ficha de entrevista pergunta por eles. Mas na hora de vincular
-- a empresa do caso, em quase todo caso e uma so -- e obrigar a escolher num
-- menu de tres e pedir decisao a toa.
--
-- Qual e o padrao e DADO por organizacao, nao numero cravado: na Central
-- Trabalhista e "Reclamada"; em outra organizacao do Seialz e o que ela
-- definir.

alter table public.opportunity_company_roles
  add column if not exists is_default boolean not null default false;

comment on column public.opportunity_company_roles.is_default is
  'Papel aplicado com um clique quando a tela nao pergunta. Um por organizacao.';

create unique index if not exists opportunity_company_roles_um_padrao
  on public.opportunity_company_roles(coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default;
