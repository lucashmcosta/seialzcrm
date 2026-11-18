-- As duas RPCs do outbox de integrações são SECURITY DEFINER e nunca tiveram
-- revoke: CREATE FUNCTION concede EXECUTE a PUBLIC por padrão, então `anon` e
-- `authenticated` conseguiam reivindicar jobs da fila (e ler o payload deles) e
-- reagendar qualquer job. Quem chama é só o integration-worker, com service_role.

revoke all on function public.rpc_claim_integration_jobs(integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_integration_jobs(integer) to service_role;

revoke all on function public.fn_schedule_retry(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_schedule_retry(uuid, text) to service_role;
