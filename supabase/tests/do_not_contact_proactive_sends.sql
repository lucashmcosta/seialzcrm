\set ON_ERROR_STOP on

-- "Não contatar" na retomada automática do agente
-- (20261118170000_do_not_contact_proactive_sends.sql).
-- Duas conversas idênticas, prontas para a retomada; a única diferença é o
-- contato de uma estar marcado como "não contatar". Só a outra é escolhida.
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz. Em transação.

begin;

\ir ../migrations/20261118170000_do_not_contact_proactive_sends.sql

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('c9000000-0000-4000-8000-0000000000a1', 'Org', 'teste-nao-contatar');
-- Agente comercial com retomada ligada: primeira retomada após 30 min, 24 h por dia.
insert into public.ai_agents (id, organization_id, name, agent_type, is_enabled, followup_enabled, followup_delays_minutes, working_hours)
values ('c9100000-0000-4000-8000-0000000000a1', 'c9000000-0000-4000-8000-0000000000a1', 'Agente', 'sdr', true, true, '{30,600}',
        '{"timezone":"UTC"}'::jsonb);
insert into public.contacts (id, organization_id, full_name, do_not_contact) values
  ('c9200000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-0000000000a1', 'Pode contatar', false),
  ('c9200000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-0000000000a1', 'Nao contatar', true);
insert into public.message_threads (id, organization_id, contact_id, channel, ai_agent_id) values
  ('c9300000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-0000000000a1', 'c9200000-0000-4000-8000-000000000001', 'whatsapp', 'c9100000-0000-4000-8000-0000000000a1'),
  ('c9300000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-0000000000a1', 'c9200000-0000-4000-8000-000000000002', 'whatsapp', 'c9100000-0000-4000-8000-0000000000a1');
-- O cliente escreveu há 3 h; o agente respondeu há 2 h e ficou sem resposta.
insert into public.messages (organization_id, thread_id, direction, sender_type, content, sent_at)
select t.organization_id, t.id, 'inbound', 'contact', 'oi', now() - interval '3 hours' from public.message_threads t where t.id::text like 'c9300000-%'
union all
select t.organization_id, t.id, 'outbound', 'agent', 'resposta', now() - interval '2 hours' from public.message_threads t where t.id::text like 'c9300000-%';
set local session_replication_role = origin;

do $teste$
declare
  v_ids text; n int; v_hora int := extract(hour from now() at time zone 'UTC');
begin
  -- A retomada só roda das 8h às 20h no fuso do agente. Fora disso a função não
  -- escolhe ninguém, e o teste não teria como distinguir os dois contatos.
  if v_hora not between 8 and 20 then
    update public.ai_agents set working_hours = jsonb_build_object('timezone',
      case when v_hora < 8 then 'Etc/GMT-10' else 'Etc/GMT+10' end)
     where id = 'c9100000-0000-4000-8000-0000000000a1';
  end if;

  select count(*), string_agg(right(thread_id::text, 2), ',' order by thread_id) into n, v_ids
    from public.fn_agent_followup_claim(50)
   where organization_id = 'c9000000-0000-4000-8000-0000000000a1';
  if n <> 1 or v_ids <> '01' then
    raise exception 'FALHOU: retomada escolheu as conversas % (esperava só a 01, a do contato que pode ser contatado)', coalesce(v_ids, '(nenhuma)');
  end if;
  -- A conversa do contato marcado não foi tocada (nem contada como retomada).
  if (select ai_followup_count from public.message_threads where id = 'c9300000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALHOU: conversa de quem pediu para não ser contatado foi marcada para retomada';
  end if;

  if has_function_privilege('anon', 'public.fn_agent_followup_claim(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.fn_agent_followup_claim(integer)', 'execute') then
    raise exception 'FALHOU: função de retomada exposta';
  end if;

  raise notice 'do_not_contact_proactive_sends: OK';
end
$teste$;

rollback;
