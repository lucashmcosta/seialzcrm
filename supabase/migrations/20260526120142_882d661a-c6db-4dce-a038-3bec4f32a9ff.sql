do $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'INTELLIGENCE_WORKER_TOKEN'
   limit 1;

  if v_token is null then
    raise notice 'INTELLIGENCE_WORKER_TOKEN ausente no vault — pulando agendamento';
    return;
  end if;

  perform cron.unschedule(jobname) from cron.job
   where jobname in ('intelligence-ghosting-hourly',
                     'intelligence-rollup-daily',
                     'intelligence-retention-daily');

  perform cron.schedule(
    'intelligence-ghosting-hourly',
    '0 * * * *',
    format($cron$
      select net.http_post(
        url     := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-ghosting-detector',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='INTELLIGENCE_WORKER_TOKEN')
        ),
        body    := '{}'::jsonb
      );
    $cron$)
  );

  perform cron.schedule(
    'intelligence-rollup-daily',
    '15 3 * * *',
    $cron$
      select net.http_post(
        url     := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-rollup-cron',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='INTELLIGENCE_WORKER_TOKEN')
        ),
        body    := '{}'::jsonb
      );
    $cron$
  );

  perform cron.schedule(
    'intelligence-retention-daily',
    '30 4 * * *',
    $cron$
      select net.http_post(
        url     := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-retention-cron',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='INTELLIGENCE_WORKER_TOKEN')
        ),
        body    := '{}'::jsonb
      );
    $cron$
  );
end $$;