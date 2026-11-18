\set ON_ERROR_STOP on

-- Entrevista agendada pelo cliente (20261118140000_nammux_interview_scheduling.sql).
-- O que este teste existe para provar:
--   * o pedido e o evento de saída nascem juntos, uma vez por horário
--   * o evento ganha job para o Nammux quando a organização tem a assinatura
--   * a entrevista que volta pela agenda confirma o pedido certo
--   * a recusa marca o pedido e o horário recusado pode ser pedido de novo
--   * negócio de outro contato ou sem processo não gera pedido
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz e as migrations 20261118110000 a 20261118140000 aplicadas. Em transação.

begin;

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('e4000000-0000-4000-8000-0000000000a1', 'Org A', 'teste-entrevista-a');
insert into public.contacts (id, organization_id, full_name) values
  ('e4200000-0000-4000-8000-0000000000c1', 'e4000000-0000-4000-8000-0000000000a1', 'Contato de teste'),
  ('e4200000-0000-4000-8000-0000000000c2', 'e4000000-0000-4000-8000-0000000000a1', 'Outro contato');
insert into public.opportunities (id, organization_id, title, pipeline_stage_id, contact_id) values
  ('e4300000-0000-4000-8000-0000000000d1', 'e4000000-0000-4000-8000-0000000000a1', 'Com processo', gen_random_uuid(), 'e4200000-0000-4000-8000-0000000000c1'),
  ('e4300000-0000-4000-8000-0000000000d2', 'e4000000-0000-4000-8000-0000000000a1', 'Sem processo', gen_random_uuid(), 'e4200000-0000-4000-8000-0000000000c1');
insert into public.nammux_process_snapshots (organization_id, opportunity_id, external_process_id, sync_status) values
  ('e4000000-0000-4000-8000-0000000000a1', 'e4300000-0000-4000-8000-0000000000d1', 'proc-ent-1', 'synced');
-- Assinatura do evento de saída, como fn_sync_nammux_subscription cria para org com a integração ligada.
insert into public.integration_subscriptions (organization_id, integration_slug, event_type, target_action, is_active, config) values
  ('e4000000-0000-4000-8000-0000000000a1', 'nammux', 'entrevista.agendada', 'send_interview_scheduled', true, '{}'::jsonb);
set local session_replication_role = origin;

do $teste$
declare
  v_org uuid := 'e4000000-0000-4000-8000-0000000000a1';
  v_opp uuid := 'e4300000-0000-4000-8000-0000000000d1';
  v_c1 uuid := 'e4200000-0000-4000-8000-0000000000c1';
  v_c2 uuid := 'e4200000-0000-4000-8000-0000000000c2';
  v_t0 timestamptz := date_trunc('hour', now()) + interval '5 days';
  v_r jsonb; n int; v_key text; v_key2 text; v_payload jsonb;
begin
  -- 1. Pedido: grava o pedido e o evento, e o evento ganha job para o Nammux.
  v_r := public.nammux_request_interview(v_org, v_opp, v_c1, null, v_t0, v_t0 + interval '1 hour');
  if v_r->>'status' <> 'requested' then raise exception 'FALHOU 1: %', v_r; end if;
  v_key := v_r->>'request_key';
  select payload into v_payload from public.integration_events where idempotency_key = v_key;
  if v_payload is null
     or v_payload->>'seialz_opportunity_id' <> v_opp::text
     or v_payload->>'seialz_contact_id' <> v_c1::text
     or v_payload->>'external_process_id' <> 'proc-ent-1'
     or (v_payload->'slot'->>'start_at')::timestamptz <> v_t0
     or (v_payload->'slot'->>'end_at')::timestamptz <> v_t0 + interval '1 hour'
     or (v_payload->>'schema_version')::int <> 1 then
    raise exception 'FALHOU 1: evento de saída errado: %', v_payload;
  end if;
  select count(*) into n from public.integration_jobs j
    join public.integration_events e on e.id = j.event_id
   where e.idempotency_key = v_key and j.integration_slug = 'nammux' and j.target_action = 'send_interview_scheduled';
  if n <> 1 then raise exception 'FALHOU 1: evento sem job para o Nammux (%)', n; end if;

  -- 2. O mesmo horário de novo: um pedido, um evento.
  v_r := public.nammux_request_interview(v_org, v_opp, v_c1, null, v_t0, v_t0 + interval '1 hour');
  if v_r->>'status' <> 'already_requested' then raise exception 'FALHOU 2: %', v_r; end if;
  select count(*) into n from public.nammux_interview_requests where organization_id = v_org;
  if n <> 1 then raise exception 'FALHOU 2: % pedidos', n; end if;
  select count(*) into n from public.integration_events where organization_id = v_org and event_type = 'entrevista.agendada';
  if n <> 1 then raise exception 'FALHOU 2: % eventos', n; end if;

  -- 3. Negócio sem processo, e negócio de outro contato: sem pedido.
  v_r := public.nammux_request_interview(v_org, 'e4300000-0000-4000-8000-0000000000d2', v_c1, null, v_t0);
  if v_r->>'status' <> 'no_process' then raise exception 'FALHOU 3a: %', v_r; end if;
  v_r := public.nammux_request_interview(v_org, v_opp, v_c2, null, v_t0 + interval '1 day');
  if v_r->>'status' <> 'no_process' then raise exception 'FALHOU 3b (negócio de outro contato): %', v_r; end if;

  -- 4. Recusa do Nammux: o pedido vira recusado; reentrega não muda nada.
  v_r := public.nammux_apply_interview_rejection(v_org, 'rej-1',
           jsonb_build_object('seialz_opportunity_id', v_opp, 'request_key', v_key,
                              'rejection_reason', 'slot_unavailable', 'reason', 'live'), now());
  if v_r->>'status' <> 'applied' then raise exception 'FALHOU 4: %', v_r; end if;
  if (select status || '/' || rejection_reason from public.nammux_interview_requests where request_key = v_key) <> 'rejected/slot_unavailable' then
    raise exception 'FALHOU 4: pedido não foi marcado como recusado';
  end if;
  v_r := public.nammux_apply_interview_rejection(v_org, 'rej-1',
           jsonb_build_object('seialz_opportunity_id', v_opp, 'request_key', v_key, 'rejection_reason', 'slot_unavailable'), now());
  if v_r->>'status' <> 'duplicate' then raise exception 'FALHOU 4 (reentrega): %', v_r; end if;
  v_r := public.nammux_apply_interview_rejection(v_org, 'rej-2',
           jsonb_build_object('seialz_opportunity_id', v_opp, 'request_key', 'chave-desconhecida'), now());
  if v_r->>'status' <> 'stale' then raise exception 'FALHOU 4 (pedido desconhecido): %', v_r; end if;
  v_r := public.nammux_apply_interview_rejection(v_org, 'rej-3', jsonb_build_object('seialz_opportunity_id', v_opp), now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 4 (sem chave): %', v_r; end if;

  -- 5. Horário recusado pode ser pedido de novo: outro pedido, outra chave, outro evento.
  v_r := public.nammux_request_interview(v_org, v_opp, v_c1, null, v_t0, v_t0 + interval '1 hour');
  if v_r->>'status' <> 'requested' then raise exception 'FALHOU 5: %', v_r; end if;
  v_key2 := v_r->>'request_key';
  if v_key2 = v_key then raise exception 'FALHOU 5: reusou a chave do pedido recusado'; end if;
  select count(*) into n from public.integration_events where organization_id = v_org and event_type = 'entrevista.agendada';
  if n <> 2 then raise exception 'FALHOU 5: % eventos', n; end if;

  -- 6. A entrevista chega pela agenda no horário pedido: confirma esse pedido (e só ele).
  v_r := public.nammux_request_interview(v_org, v_opp, v_c1, null, v_t0 + interval '2 days');
  v_r := public.nammux_apply_process_event(v_org, 'agenda-ent-1', jsonb_build_object(
    'schema_version', 1, 'reason', 'live', 'version', 500, 'change', 'scheduled',
    'seialz_opportunity_id', v_opp, 'external_process_id', 'proc-ent-1',
    'event', jsonb_build_object('id', 'ev-ent-1', 'type', 'entrevista', 'status', 'pendente', 'start_at', v_t0,
                                'all_day', false, 'root_event_id', 'ev-ent-1', 'reschedule_seq', 0)), now());
  if v_r->>'status' <> 'applied' then raise exception 'FALHOU 6: agenda não aplicada: %', v_r; end if;
  if (select status || '/' || external_event_id from public.nammux_interview_requests where request_key = v_key2) <> 'confirmed/ev-ent-1' then
    raise exception 'FALHOU 6: pedido não confirmado';
  end if;
  select count(*) into n from public.nammux_interview_requests where organization_id = v_org and status = 'requested';
  if n <> 1 then raise exception 'FALHOU 6: o pedido do outro horário devia continuar em aberto (%)', n; end if;
  if (select status from public.nammux_interview_requests where request_key = v_key) <> 'rejected' then
    raise exception 'FALHOU 6: pedido recusado foi alterado';
  end if;
  -- audiência no mesmo horário não confirma pedido de entrevista
  v_r := public.nammux_apply_process_event(v_org, 'agenda-aud-1', jsonb_build_object(
    'schema_version', 1, 'reason', 'live', 'version', 501, 'change', 'scheduled',
    'seialz_opportunity_id', v_opp, 'external_process_id', 'proc-ent-1',
    'event', jsonb_build_object('id', 'ev-aud-1', 'type', 'audiencia', 'status', 'pendente',
                                'start_at', v_t0 + interval '2 days', 'all_day', false)), now());
  select count(*) into n from public.nammux_interview_requests where organization_id = v_org and status = 'requested';
  if n <> 1 then raise exception 'FALHOU 6: audiência confirmou pedido de entrevista'; end if;

  -- 7. Permissões.
  if has_table_privilege('authenticated', 'public.nammux_interview_requests', 'select')
     or has_table_privilege('anon', 'public.nammux_interview_requests', 'select') then
    raise exception 'FALHOU 7: pedidos legíveis fora do service_role';
  end if;
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('nammux_request_interview', 'nammux_apply_interview_rejection',
                       'nammux_interview_confirm_from_agenda', 'nammux_after_interview_rejection')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then raise exception 'FALHOU 7: % função(ões) expostas', n; end if;

  raise notice 'nammux_interview_scheduling: OK';
end
$teste$;

rollback;
