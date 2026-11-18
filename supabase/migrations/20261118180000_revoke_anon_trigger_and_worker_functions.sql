-- Tira de `anon` e `authenticated` o EXECUTE de funções que só triggers, workers
-- e o agendador usam.
--
-- `CREATE FUNCTION` concede EXECUTE a PUBLIC por padrão. Em produção, 166 de 330
-- funções SECURITY DEFINER do schema public são executáveis por `anon`. Este é o
-- primeiro lote, o que não tem como quebrar nada:
--
--   1. Toda função de trigger. O Postgres confere o EXECUTE dela quando o
--      trigger é criado, não quando dispara: quem faz o INSERT/UPDATE não
--      precisa dessa permissão.
--   2. Funções de fila e worker, chamadas só com service_role ou pelo pg_cron
--      (que roda como dono do banco).
--
-- O restante está classificado, com a evidência de quem chama, em
-- docs/operations/proposals/2026-11-18-funcoes-expostas-a-anon.md.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and (
         p.prorettype = 'trigger'::regtype
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
         ])
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
