do $$
declare
  v_token text;
  v_g bigint; v_r bigint; v_t bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name='INTELLIGENCE_WORKER_TOKEN' limit 1;

  select net.http_post(
    url:='https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-ghosting-detector',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',v_token),
    body:='{}'::jsonb) into v_g;
  select net.http_post(
    url:='https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-rollup-cron',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',v_token),
    body:='{}'::jsonb) into v_r;
  select net.http_post(
    url:='https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-retention-cron',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',v_token),
    body:='{}'::jsonb) into v_t;

  raise notice 'Disparado: ghosting req_id=% rollup req_id=% retention req_id=%', v_g, v_r, v_t;
end $$;