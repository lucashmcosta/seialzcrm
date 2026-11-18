\set ON_ERROR_STOP on

-- Movimentações do Nammux (20261118130000_nammux_process_movements.sql).
-- O que este teste existe para provar:
--   * o payload que o Nammux produz de verdade é aplicado sem adaptação
--   * a mesma movimentação é gravada (e avisada) uma vez, por reentrega do
--     mesmo evento ou por outro evento com a mesma movimentação
--   * payload fora do contrato é recusa definitiva e não deixa nada gravado
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz e as migrations 20261118110000 e 20261118130000 aplicadas. Em transação.

\set fixture `cat supabase/tests/fixtures/nammux/process.movement.added.json`

begin;

set local session_replication_role = replica;
insert into public.organizations (id, name, slug) values
  ('f1000000-0000-4000-8000-0000000000b1', 'Org do contrato', 'teste-mov-a'),
  ('e1000000-0000-4000-8000-0000000000a2', 'Org B', 'teste-mov-b');
insert into public.opportunities (id, organization_id, title, pipeline_stage_id) values
  ('f6000000-0000-4000-8000-0000000000d1', 'f1000000-0000-4000-8000-0000000000b1', 'Negócio A', gen_random_uuid());
set local session_replication_role = origin;

create temp table _avisos (seq serial, external_movement_id text, reason text) on commit drop;
create or replace function public.nammux_after_process_movement(_movement_id uuid, _reason text)
returns void language plpgsql as $$
begin
  insert into _avisos (external_movement_id, reason)
  select m.external_movement_id, _reason from public.nammux_process_movements m where m.id = _movement_id;
end $$;

select set_config('teste.fixture', :'fixture', true);

do $teste$
declare
  v_org uuid := 'f1000000-0000-4000-8000-0000000000b1';
  v_org_b uuid := 'e1000000-0000-4000-8000-0000000000a2';
  v_data jsonb := current_setting('teste.fixture')::jsonb;
  v_r jsonb; n int; v_row public.nammux_process_movements;
begin
  -- 1. Contrato.
  v_r := public.nammux_apply_process_movement(v_org, 'mov-1', v_data, now());
  if v_r->>'status' <> 'applied' then raise exception 'CONTRATO QUEBRADO: %', v_r; end if;
  select * into v_row from public.nammux_process_movements where organization_id = v_org;
  if v_row.external_movement_id <> 'fc000000-0000-4000-8000-000000000001'
     or v_row.external_process_id <> 'f3000000-0000-4000-8000-0000000000a1'
     or v_row.opportunity_id <> 'f6000000-0000-4000-8000-0000000000d1'
     or v_row.code <> 11384 or v_row.catalog_key <> 'liquidacao' or v_row.tone <> 'neutra' or not v_row.notify
     or v_row.text <> 'Começou a fase de cálculo: agora a Justiça define os valores devidos.'
     or v_row.occurred_at <> '2026-11-18 15:00:00+00'::timestamptz or v_row.source_version <> 1000 then
    raise exception 'CONTRATO QUEBRADO: campo lido errado: %', to_jsonb(v_row);
  end if;
  if (select count(*) from _avisos) <> 1 then raise exception 'FALHOU 1: gancho não chamado uma vez'; end if;

  -- 2. Reentrega do mesmo evento, e outro evento com a mesma movimentação: nada novo.
  v_r := public.nammux_apply_process_movement(v_org, 'mov-1', v_data, now());
  if v_r->>'status' <> 'duplicate' then raise exception 'FALHOU 2: %', v_r; end if;
  v_r := public.nammux_apply_process_movement(v_org, 'mov-1b', jsonb_set(v_data, '{version}', '2000'), now());
  if v_r->>'status' <> 'stale' then raise exception 'FALHOU 2 (outro evento): %', v_r; end if;
  select count(*) into n from public.nammux_process_movements where organization_id = v_org;
  if n <> 1 or (select count(*) from _avisos) <> 1 then raise exception 'FALHOU 2: gravou ou avisou de novo'; end if;

  -- 3. Recusas definitivas, sem recibo.
  v_r := public.nammux_apply_process_movement(v_org, 'mov-x1', jsonb_set(v_data, '{movement,tone}', '"qualquer"'), now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 3a: %', v_r; end if;
  v_r := public.nammux_apply_process_movement(v_org, 'mov-x2', jsonb_set(v_data, '{movement,text}', '"   "'), now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 3b: %', v_r; end if;
  v_r := public.nammux_apply_process_movement(v_org, 'mov-x3', jsonb_set(v_data, '{movement,occurred_at}', '"ontem"'), now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 3c: %', v_r; end if;
  v_r := public.nammux_apply_process_movement(v_org, 'mov-x4', v_data - 'movement', now());
  if v_r->>'status' <> 'invalid' then raise exception 'FALHOU 3d: %', v_r; end if;
  v_r := public.nammux_apply_process_movement(v_org_b, 'mov-x5', v_data, now());
  if v_r->>'status' <> 'opportunity_not_found' then raise exception 'FALHOU 3e: %', v_r; end if;
  select count(*) into n from public.nammux_sync_events where external_event_id like 'mov-x%';
  if n <> 0 then raise exception 'FALHOU 3: recusa deixou recibo'; end if;

  -- 4. Permissões.
  if has_table_privilege('anon', 'public.nammux_process_movements', 'select')
     or has_table_privilege('authenticated', 'public.nammux_process_movements', 'insert')
     or not has_table_privilege('authenticated', 'public.nammux_process_movements', 'select')
     or not (select relrowsecurity from pg_class where oid = 'public.nammux_process_movements'::regclass) then
    raise exception 'FALHOU 4: permissões da tabela erradas';
  end if;
  if has_function_privilege('anon', 'public.nammux_apply_process_movement(uuid,text,jsonb,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.nammux_apply_process_movement(uuid,text,jsonb,timestamptz)', 'execute') then
    raise exception 'FALHOU 4: RPC exposta';
  end if;

  raise notice 'nammux_process_movements: OK';
end
$teste$;

rollback;
