\set ON_ERROR_STOP on

-- Correções da base da integração Nammux:
--   * rpc_claim_integration_jobs e fn_schedule_retry só para service_role
--   * o log de entrada (nammux_sync_events) aceita o mesmo evento ser regravado:
--     um evento que falhou e depois deu certo passa a constar como `processed`
--
-- Rodar só contra Postgres descartável com o schema do Seialz já carregado
-- (as migrations do repo não reconstroem o banco do zero; ver
-- docs/operations/drift/2026-11-18.md). Tudo em transação, com rollback.

begin;

\ir ../migrations/20261118100000_outbox_rpcs_service_role_only.sql

do $teste$
declare
  v_org uuid := 'c1000000-0000-4000-8000-0000000000a1';
  n int;
  v_status text;
begin
  -- 1. Fila de integrações fechada para quem não é service_role.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('rpc_claim_integration_jobs', 'fn_schedule_retry')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then raise exception 'FALHOU 1: % RPC(s) do outbox ainda expostas', n; end if;

  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('rpc_claim_integration_jobs', 'fn_schedule_retry')
     and has_function_privilege('service_role', p.oid, 'execute');
  if n <> 2 then raise exception 'FALHOU 1: service_role perdeu acesso (%/2)', n; end if;

  -- 2. Mesmo evento, primeiro com erro e depois processado: uma linha, `processed`.
  --    É o que o upsert do ingest faz; com insert simples a segunda gravação
  --    batia na chave única e o evento nunca constava como processado.
  set local session_replication_role = replica;
  insert into public.nammux_sync_events (organization_id, external_event_id, event_type, direction, status, error)
  values (v_org, 'evento-teste-1', 'process.snapshot.updated', 'inbound', 'error', 'falha transitória');

  insert into public.nammux_sync_events (organization_id, external_event_id, event_type, direction, status, error)
  values (v_org, 'evento-teste-1', 'process.snapshot.updated', 'inbound', 'processed', null)
  on conflict (organization_id, direction, external_event_id)
  do update set status = excluded.status, error = excluded.error;

  select count(*), max(status) into n, v_status
    from public.nammux_sync_events
   where organization_id = v_org and external_event_id = 'evento-teste-1';
  if n <> 1 or v_status <> 'processed' then
    raise exception 'FALHOU 2: esperava 1 linha processed, veio % linha(s) %', n, v_status;
  end if;

  -- A chave única que o ingest usa como alvo do upsert existe com essas colunas.
  select count(*) into n
    from pg_constraint
   where conrelid = 'public.nammux_sync_events'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (organization_id, direction, external_event_id)';
  if n <> 1 then raise exception 'FALHOU 2: chave única do log não encontrada'; end if;

  raise notice 'nammux_base_correcoes: OK';
end
$teste$;

rollback;
