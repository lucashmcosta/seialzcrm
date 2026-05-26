create or replace function public.intelligence_fire_all_now()
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token text;
  v_ghost bigint; v_roll bigint; v_ret bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name='INTELLIGENCE_WORKER_TOKEN' limit 1;
  if v_token is null then raise exception 'INTELLIGENCE_WORKER_TOKEN ausente'; end if;

  select net.http_post(
    url:='https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-ghosting-detector',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',v_token),
    body:='{}'::jsonb) into v_ghost;

  select net.http_post(
    url:='https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-rollup-cron',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',v_token),
    body:='{}'::jsonb) into v_roll;

  select net.http_post(
    url:='https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-retention-cron',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',v_token),
    body:='{}'::jsonb) into v_ret;

  return jsonb_build_object('ghosting',v_ghost,'rollup',v_roll,'retention',v_ret);
end $$;
revoke all on function public.intelligence_fire_all_now() from public, anon, authenticated;