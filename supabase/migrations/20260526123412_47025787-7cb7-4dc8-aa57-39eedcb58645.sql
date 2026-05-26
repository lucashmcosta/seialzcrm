
-- Schedule intelligence-worker every 30 seconds to drain intelligence_jobs queue
do $$
declare
  v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name='INTELLIGENCE_WORKER_TOKEN' limit 1;
  -- unschedule if exists
  perform cron.unschedule(jobid) from cron.job where jobname='intelligence-worker-30s';
  perform cron.schedule(
    'intelligence-worker-30s',
    '30 seconds',
    format($cron$
      select net.http_post(
        url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-worker',
        headers := jsonb_build_object('Content-Type','application/json','x-worker-token', %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
      );
    $cron$, v_token)
  );

  -- Update rollup-daily to have 60s timeout
  perform cron.unschedule(jobid) from cron.job where jobname='intelligence-rollup-daily';
  perform cron.schedule(
    'intelligence-rollup-daily',
    '15 3 * * *',
    format($cron$
      select net.http_post(
        url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-rollup-cron',
        headers := jsonb_build_object('Content-Type','application/json','x-worker-token', %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cron$, v_token)
  );

  -- Update ghosting-hourly with explicit timeout
  perform cron.unschedule(jobid) from cron.job where jobname='intelligence-ghosting-hourly';
  perform cron.schedule(
    'intelligence-ghosting-hourly',
    '0 * * * *',
    format($cron$
      select net.http_post(
        url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-ghosting-detector',
        headers := jsonb_build_object('Content-Type','application/json','x-worker-token', %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cron$, v_token)
  );
end $$;
