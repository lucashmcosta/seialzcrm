-- Schedule meta-discover-ads-cron 30min before insights sync
SELECT cron.schedule(
  'meta-discover-ads-cron',
  '30 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-discover-ads-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Invoke once now to test discovery + populate any missing ads
SELECT net.http_post(
  url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-discover-ads-cron',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())
  ),
  body := jsonb_build_object('organization_id', '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'),
  timeout_milliseconds := 120000
);