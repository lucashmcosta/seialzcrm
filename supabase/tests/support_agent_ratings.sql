\set ON_ERROR_STOP on

-- Avaliação do agente de atendimento (20261118160000_support_agent_ratings.sql).
-- O que este teste existe para provar:
--   * a pergunta só sai para conversa de atendimento, com agente `support`,
--     parada depois de uma resposta do agente, sem ninguém chamado, janela aberta
--   * conversa do agente comercial nunca recebe a pergunta
--   * uma pergunta por conversa por dia, mesmo com duas execuções
--   * só a primeira resposta vale; pergunta que falhou ao enviar não fica aberta
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz e a migration aplicada. Em transação.

begin;

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('b8000000-0000-4000-8000-0000000000a1', 'Org com avaliação', 'teste-avaliacao-a'),
  ('b8000000-0000-4000-8000-0000000000a2', 'Org sem a flag', 'teste-avaliacao-b');
insert into public.ai_agents (id, organization_id, name, agent_type, is_enabled) values
  ('b8100000-0000-4000-8000-0000000000a1', 'b8000000-0000-4000-8000-0000000000a1', 'Atendimento', 'support', true),
  ('b8100000-0000-4000-8000-0000000000a2', 'b8000000-0000-4000-8000-0000000000a1', 'Comercial', 'sdr', true),
  ('b8100000-0000-4000-8000-0000000000a3', 'b8000000-0000-4000-8000-0000000000a2', 'Atendimento B', 'support', true);
insert into public.contacts (id, organization_id, full_name, do_not_contact)
select ('b8200000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       case when n = 9 then 'b8000000-0000-4000-8000-0000000000a2' else 'b8000000-0000-4000-8000-0000000000a1' end::uuid,
       'Contato ' || n, n = 8
  from generate_series(1, 9) n;

-- Conversas. Só a T1 deve receber a pergunta.
--  T1 atendimento, agente support, última do agente há 40 min, janela aberta        → pergunta
--  T2 igual, mas a última mensagem é do CLIENTE                                     → não
--  T3 igual, mas a última do agente foi há 10 min (ainda quente)                    → não
--  T4 igual, mas alguém da equipe foi chamado                                       → não
--  T5 igual, mas a conversa foi passada para a equipe (agente liberou)              → não
--  T6 conversa COMERCIAL com agente sdr                                             → não
--  T7 igual à T1, mas a janela de 24 h fechou                                       → não
--  T8 igual à T1, mas o contato pediu para não ser contatado                        → não
--  T9 igual à T1, em organização sem a flag                                         → não
insert into public.message_threads (id, organization_id, contact_id, channel, business_context, ai_agent_id,
                                    ai_agent_released_at, needs_human_attention, status, whatsapp_last_inbound_at)
select ('b8300000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       case when n = 9 then 'b8000000-0000-4000-8000-0000000000a2' else 'b8000000-0000-4000-8000-0000000000a1' end::uuid,
       ('b8200000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'whatsapp',
       case when n = 6 then 'sales' else 'customer_service' end,
       case when n = 6 then 'b8100000-0000-4000-8000-0000000000a2' when n = 9 then 'b8100000-0000-4000-8000-0000000000a3'
            else 'b8100000-0000-4000-8000-0000000000a1' end::uuid,
       case when n = 5 then now() - interval '5 minutes' end,
       n = 4,
       'open',
       case when n = 7 then now() - interval '30 hours' else now() - interval '1 hour' end
  from generate_series(1, 9) n;

insert into public.messages (organization_id, thread_id, direction, sender_type, content, sent_at)
select t.organization_id, t.id, 'inbound', 'contact', 'pergunta', now() - interval '1 hour' from public.message_threads t
 where t.id::text like 'b8300000-%';
insert into public.messages (organization_id, thread_id, direction, sender_type, content, sent_at)
select t.organization_id, t.id, 'outbound', 'agent', 'resposta',
       case when right(t.id::text, 2) = '03' then now() - interval '10 minutes' else now() - interval '40 minutes' end
  from public.message_threads t where t.id::text like 'b8300000-%';
-- T2: o cliente escreveu por último
insert into public.messages (organization_id, thread_id, direction, sender_type, content, sent_at)
values ('b8000000-0000-4000-8000-0000000000a1', 'b8300000-0000-4000-8000-000000000002', 'inbound', 'contact', 'outra dúvida', now() - interval '35 minutes');
-- nota interna depois da resposta não conta como "última mensagem"
insert into public.messages (organization_id, thread_id, direction, sender_type, content, sent_at, is_internal_note)
values ('b8000000-0000-4000-8000-0000000000a1', 'b8300000-0000-4000-8000-000000000001', 'internal', 'system', 'nota', now() - interval '5 minutes', true);
set local session_replication_role = origin;

insert into public.integration_feature_flags (flag_key, organization_id, enabled) values
  ('support_agent_rating', 'b8000000-0000-4000-8000-0000000000a1', true);

do $teste$
declare
  v_t1 uuid := 'b8300000-0000-4000-8000-000000000001';
  n int; v_ids text; v_id uuid;
begin
  -- 1. Só a T1.
  select count(*), string_agg(right(thread_id::text, 2), ',' order by thread_id) into n, v_ids from public.support_rating_claim_due(50);
  if n <> 1 or v_ids <> '01' then raise exception 'FALHOU 1: perguntaria para as conversas % (esperava só a 01)', v_ids; end if;
  select id into v_id from public.support_agent_ratings where thread_id = v_t1;
  if (select agent_id::text || '/' || ask_status from public.support_agent_ratings where id = v_id)
     <> 'b8100000-0000-4000-8000-0000000000a1/pending' then raise exception 'FALHOU 1: registro da pergunta'; end if;

  -- 2. Segunda execução no mesmo dia: ninguém.
  select count(*) into n from public.support_rating_claim_due(50);
  if n <> 0 then raise exception 'FALHOU 2: perguntou de novo no mesmo dia'; end if;

  -- 3. Enquanto a pergunta não foi enviada, não há pergunta em aberto.
  if public.support_rating_open(v_t1) is not null then raise exception 'FALHOU 3: pergunta pendente consta como aberta'; end if;
  perform public.support_rating_mark_asked(v_id, true, null);
  if public.support_rating_open(v_t1) is distinct from v_id then raise exception 'FALHOU 3: pergunta enviada não consta como aberta'; end if;

  -- 4. Só a primeira resposta vale.
  if not public.support_rating_record(v_id, 'no') then raise exception 'FALHOU 4: não gravou a resposta'; end if;
  if public.support_rating_record(v_id, 'yes') then raise exception 'FALHOU 4: gravou a segunda resposta'; end if;
  if (select answer from public.support_agent_ratings where id = v_id) <> 'no' then raise exception 'FALHOU 4: resposta trocada'; end if;
  if public.support_rating_open(v_t1) is not null then raise exception 'FALHOU 4: pergunta respondida continua aberta'; end if;
  begin
    perform public.support_rating_record(v_id, 'talvez');
    raise exception 'FALHOU 4: aceitou resposta inválida';
  exception when invalid_parameter_value then null;
  end;

  -- 5. Pergunta que falhou ao enviar: não fica aberta e não é repetida no dia.
  update public.support_agent_ratings set ask_status = 'pending', answer = null, answered_at = null where id = v_id;
  perform public.support_rating_mark_asked(v_id, false, null);
  if public.support_rating_open(v_t1) is not null then raise exception 'FALHOU 5: pergunta que falhou consta como aberta'; end if;
  select count(*) into n from public.support_rating_claim_due(50);
  if n <> 0 then raise exception 'FALHOU 5: repetiu a pergunta que falhou'; end if;
  if public.support_rating_record(v_id, 'yes') then raise exception 'FALHOU 5: gravou resposta de pergunta não enviada'; end if;

  -- 6. Pergunta enviada há mais de 24 h não está mais aberta.
  update public.support_agent_ratings set ask_status = 'sent', asked_at = now() - interval '25 hours' where id = v_id;
  if public.support_rating_open(v_t1) is not null then raise exception 'FALHOU 6: pergunta velha continua aberta'; end if;

  -- 7. Permissões.
  if has_table_privilege('anon', 'public.support_agent_ratings', 'select')
     or has_table_privilege('authenticated', 'public.support_agent_ratings', 'insert')
     or has_table_privilege('authenticated', 'public.support_agent_ratings', 'update')
     or not (select relrowsecurity from pg_class where oid = 'public.support_agent_ratings'::regclass) then
    raise exception 'FALHOU 7: permissões da tabela';
  end if;
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'support_rating_%'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then raise exception 'FALHOU 7: % função(ões) expostas', n; end if;

  raise notice 'support_agent_ratings: OK';
end
$teste$;

rollback;
