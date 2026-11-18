\set ON_ERROR_STOP on

-- Funções de trigger e de fila não são executáveis por anon nem authenticated
-- (20261118180000_revoke_anon_trigger_and_worker_functions.sql).
-- Falha se uma delas voltar a ficar exposta — por exemplo, uma função de trigger
-- nova criada sem `revoke`.
--
-- Rodar da raiz do repositório, contra Postgres descartável com o schema do
-- Seialz. Em transação.

begin;

\ir ../migrations/20261118180000_revoke_anon_trigger_and_worker_functions.sql

do $teste$
declare
  v_expostas text;
  n int;
begin
  select count(*), string_agg(p.proname, ', ' order by p.proname) into n, v_expostas
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f'
     and (p.prorettype = 'trigger'::regtype
          or p.proname = any (array[
            'rpc_claim_integration_jobs',
            'rpc_claim_intelligence_jobs',
            'rpc_claim_push_delivery_jobs',
            'rpc_claim_inbound_shadow_events',
            'rpc_claim_inbound_events',
            'fn_schedule_retry',
            'fn_inbound_archive_dead_letter',
            'fn_inbound_expire',
            'fn_inbound_reap_stuck',
            'fn_inbound_replay',
            'fn_inbound_schedule_retry',
            'intelligence_reap_stale_jobs',
            'intelligence_fire_all_now',
            'prune_intelligence_worker_runs',
            'recover_stale_job_items'
          ]))
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then
    raise exception 'FALHOU: % função(ões) de trigger ou de fila executáveis por anon/authenticated: %', n, v_expostas;
  end if;

  -- service_role continua podendo chamar as de fila.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'rpc_claim_%'
     and not has_function_privilege('service_role', p.oid, 'execute');
  if n <> 0 then raise exception 'FALHOU: service_role perdeu acesso a % função(ões) de fila', n; end if;

  -- Triggers continuam disparando para quem não tem EXECUTE na função: um
  -- usuário comum grava numa tabela com trigger.
  create temp table _t (id int primary key, n int) on commit drop;
  create function pg_temp._bump() returns trigger language plpgsql as $f$ begin new.n := coalesce(new.n, 0) + 1; return new; end $f$;
  revoke all on function pg_temp._bump() from public;
  create trigger _t_bump before insert on _t for each row execute function pg_temp._bump();
  grant insert, select on _t to authenticated;
  set local role authenticated;
  insert into _t (id) values (1);
  if (select _t.n from _t where id = 1) <> 1 then raise exception 'FALHOU: trigger não disparou sem EXECUTE'; end if;
  reset role;

  raise notice 'anon_exposed_functions: OK';
end
$teste$;

rollback;
