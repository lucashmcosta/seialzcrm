\set ON_ERROR_STOP on

-- Agenda do Nammux (20261118110000_nammux_process_events.sql).
-- O que este teste existe para provar:
--   * o mesmo evento entregue duas vezes é aplicado uma vez
--   * versão mais antiga chegando depois da nova é ignorada
--   * payload fora do contrato e negócio inexistente são recusa definitiva,
--     e não deixam nada gravado
--   * negócio de outra organização não é aceito
--   * um evento que falhou antes pode ser aplicado depois
--   * a tabela é só-leitura para a org e as funções são só service_role
--
-- Rodar só contra Postgres descartável com o schema do Seialz carregado e a
-- migration aplicada (ver docs/operations/drift/2026-11-18.md). Em transação.

begin;

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('e1000000-0000-4000-8000-0000000000a1', 'Org A', 'teste-agenda-a'),
  ('e1000000-0000-4000-8000-0000000000a2', 'Org B', 'teste-agenda-b');
insert into public.contacts (id, organization_id, full_name) values
  ('e2000000-0000-4000-8000-0000000000c1', 'e1000000-0000-4000-8000-0000000000a1', 'Contato de teste');
insert into public.opportunities (id, organization_id, title, pipeline_stage_id, contact_id) values
  ('e3000000-0000-4000-8000-0000000000d1', 'e1000000-0000-4000-8000-0000000000a1', 'Negócio A', gen_random_uuid(), 'e2000000-0000-4000-8000-0000000000c1'),
  ('e3000000-0000-4000-8000-0000000000d2', 'e1000000-0000-4000-8000-0000000000a2', 'Negócio B', gen_random_uuid(), null);
set local session_replication_role = origin;

create function pg_temp.evento(_version bigint, _change text, _start timestamptz, _extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'schema_version', 1, 'source', 'nammux', 'reason', 'live', 'version', _version,
    'seialz_opportunity_id', 'e3000000-0000-4000-8000-0000000000d1',
    'external_process_id', 'proc-1',
    'change', _change,
    'event', jsonb_build_object(
      'id', 'ev-1', 'type', 'audiencia', 'subtype', 'Instrução', 'status', 'pendente',
      'start_at', _start, 'end_at', null, 'all_day', false, 'timezone', 'America/Sao_Paulo',
      'modality', 'virtual', 'location', null, 'virtual_link', 'https://exemplo.invalid/sala',
      'rescheduled_from_event_id', null, 'root_event_id', 'ev-1', 'reschedule_seq', 0,
      'previous_start_at', null, 'cancel_reason', null, 'updated_at', now())
  ) || _extra;
$$;

do $teste$
declare
  v_org uuid := 'e1000000-0000-4000-8000-0000000000a1';
  v_org_b uuid := 'e1000000-0000-4000-8000-0000000000a2';
  v_t0 timestamptz := date_trunc('hour', now()) + interval '30 days';
  v_r jsonb; n int; v_row public.nammux_process_events;
begin
  -- 1. Aplica.
  v_r := public.nammux_apply_process_event(v_org, 'evt-1', pg_temp.evento(10, 'scheduled', v_t0), now());
  if v_r->>'status' <> 'applied' then raise exception 'FALHOU 1: %', v_r; end if;
  select * into v_row from public.nammux_process_events where organization_id = v_org and external_event_id = 'ev-1';
  if v_row.start_at <> v_t0 or v_row.event_type <> 'audiencia' or v_row.subtype <> 'Instrução'
     or v_row.status <> 'pendente' or v_row.source_version <> 10 or v_row.root_external_event_id <> 'ev-1'
     or v_row.last_change <> 'scheduled' or v_row.removed_at is not null
     or v_row.opportunity_id <> 'e3000000-0000-4000-8000-0000000000d1' then
    raise exception 'FALHOU 1: estado errado: %', to_jsonb(v_row);
  end if;

  -- 2. Mesmo evento de novo: duplicado, nada muda.
  v_r := public.nammux_apply_process_event(v_org, 'evt-1', pg_temp.evento(10, 'scheduled', v_t0), now());
  if v_r->>'status' <> 'duplicate' then raise exception 'FALHOU 2: %', v_r; end if;
  select count(*) into n from public.nammux_process_events where organization_id = v_org;
  if n <> 1 then raise exception 'FALHOU 2: % linhas', n; end if;
  select count(*) into n from public.nammux_sync_events where organization_id = v_org and external_event_id = 'evt-1';
  if n <> 1 then raise exception 'FALHOU 2: % recibos', n; end if;

  -- 3. Remarcação (versão 30) chega ANTES de uma mudança mais antiga (versão 20).
  v_r := public.nammux_apply_process_event(v_org, 'evt-3', pg_temp.evento(30, 'rescheduled', v_t0 + interval '7 days'), now());
  if v_r->>'status' <> 'applied' then raise exception 'FALHOU 3 (nova): %', v_r; end if;
  v_r := public.nammux_apply_process_event(v_org, 'evt-2', pg_temp.evento(20, 'details_updated', v_t0), now());
  if v_r->>'status' <> 'stale' then raise exception 'FALHOU 3 (antiga): %', v_r; end if;
  select * into v_row from public.nammux_process_events where organization_id = v_org and external_event_id = 'ev-1';
  if v_row.start_at <> v_t0 + interval '7 days' or v_row.source_version <> 30 or v_row.last_change <> 'rescheduled' then
    raise exception 'FALHOU 3: versão antiga regrediu o estado: %', to_jsonb(v_row);
  end if;
  -- e a antiga, reenviada, é duplicada (não fica sendo reprocessada)
  v_r := public.nammux_apply_process_event(v_org, 'evt-2', pg_temp.evento(20, 'details_updated', v_t0), now());
  if v_r->>'status' <> 'duplicate' then raise exception 'FALHOU 3 (reenvio da antiga): %', v_r; end if;

  -- 4. Removido marca removed_at; marcado de novo limpa.
  v_r := public.nammux_apply_process_event(v_org, 'evt-4', pg_temp.evento(40, 'removed', v_t0 + interval '7 days'), now());
  if (select removed_at from public.nammux_process_events where organization_id = v_org and external_event_id = 'ev-1') is null then
    raise exception 'FALHOU 4: removed_at vazio';
  end if;
  v_r := public.nammux_apply_process_event(v_org, 'evt-5', pg_temp.evento(50, 'scheduled', v_t0 + interval '7 days'), now());
  if (select removed_at from public.nammux_process_events where organization_id = v_org and external_event_id = 'ev-1') is not null then
    raise exception 'FALHOU 4: removed_at não limpou';
  end if;

  -- 5. Recusas definitivas: nada gravado, nem recibo.
  v_r := public.nammux_apply_process_event(v_org, 'evt-x1', pg_temp.evento(60, 'mudanca_inventada', v_t0), now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 5a: %', v_r; end if;
  v_r := public.nammux_apply_process_event(v_org, 'evt-x2', pg_temp.evento(60, 'scheduled', v_t0) || '{"version":"abc"}', now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 5b: %', v_r; end if;
  v_r := public.nammux_apply_process_event(v_org, 'evt-x3', pg_temp.evento(60, 'scheduled', v_t0) #- '{event,start_at}', now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 5c: %', v_r; end if;
  v_r := public.nammux_apply_process_event(v_org, 'evt-x4', pg_temp.evento(60, 'scheduled', v_t0) || '{"seialz_opportunity_id":"e3000000-0000-4000-8000-0000000000ff"}', now());
  if v_r->>'status' <> 'opportunity_not_found' then raise exception 'FALHOU 5d: %', v_r; end if;
  v_r := public.nammux_apply_process_event(v_org, '', pg_temp.evento(60, 'scheduled', v_t0), now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 5e: %', v_r; end if;
  select count(*) into n from public.nammux_sync_events where organization_id = v_org and external_event_id like 'evt-x%';
  if n <> 0 then raise exception 'FALHOU 5: recusa deixou % recibo(s)', n; end if;
  if (select source_version from public.nammux_process_events where organization_id = v_org and external_event_id = 'ev-1') <> 50 then
    raise exception 'FALHOU 5: recusa alterou o estado';
  end if;

  -- 6. Negócio de outra organização: recusado.
  v_r := public.nammux_apply_process_event(v_org_b, 'evt-b1', pg_temp.evento(70, 'scheduled', v_t0), now());
  if v_r->>'status' <> 'opportunity_not_found' then raise exception 'FALHOU 6: %', v_r; end if;
  select count(*) into n from public.nammux_process_events where organization_id = v_org_b;
  if n <> 0 then raise exception 'FALHOU 6: gravou na outra organização'; end if;

  -- 7. Evento que constava como erro (tentativa anterior falhou): aplica agora.
  insert into public.nammux_sync_events (organization_id, external_event_id, event_type, direction, status, error)
  values (v_org, 'evt-7', 'process.agenda.changed', 'inbound', 'error', 'falha anterior');
  v_r := public.nammux_apply_process_event(v_org, 'evt-7', pg_temp.evento(80, 'details_updated', v_t0 + interval '7 days'), now());
  if v_r->>'status' <> 'applied' then raise exception 'FALHOU 7: %', v_r; end if;
  if (select status from public.nammux_sync_events where organization_id = v_org and external_event_id = 'evt-7') <> 'processed' then
    raise exception 'FALHOU 7: recibo não virou processed';
  end if;

  -- 8. Permissões.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('nammux_apply_process_event', 'nammux_inbound_receipt', 'nammux_after_process_event')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then raise exception 'FALHOU 8: % função(ões) expostas', n; end if;
  if has_table_privilege('anon', 'public.nammux_process_events', 'select')
     or has_table_privilege('authenticated', 'public.nammux_process_events', 'insert')
     or has_table_privilege('authenticated', 'public.nammux_process_events', 'update')
     or has_table_privilege('authenticated', 'public.nammux_process_events', 'delete')
     or not has_table_privilege('authenticated', 'public.nammux_process_events', 'select') then
    raise exception 'FALHOU 8: permissões da tabela erradas';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.nammux_process_events'::regclass) then
    raise exception 'FALHOU 8: RLS desligada';
  end if;

  raise notice 'nammux_process_events: OK';
end
$teste$;

rollback;
