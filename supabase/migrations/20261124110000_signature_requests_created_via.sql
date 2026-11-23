-- Quem gerou o envio de contrato: uma pessoa pela tela (user) ou o agente de IA (ai_agent).
-- O webhook da SuvSign usa isso para marcar a oportunidade como ganha quando a cliente assina
-- um contrato que o agente enviou (o da equipe continua como antes: quem move é a pessoa).
alter table public.signature_requests
  add column if not exists created_via text not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'signature_requests_created_via_check'
  ) then
    alter table public.signature_requests
      add constraint signature_requests_created_via_check check (created_via in ('user', 'ai_agent'));
  end if;
end $$;
