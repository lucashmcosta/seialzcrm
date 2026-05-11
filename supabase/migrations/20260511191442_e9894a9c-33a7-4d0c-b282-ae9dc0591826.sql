SELECT net.http_post(
  url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/marketing-insights-sync-daily',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())
  ),
  body := jsonb_build_object('organization_id', '40ae935c-a7f7-4ad7-8ea4-91be6404a95f', 'days_back', 3, 'limit', 100),
  timeout_milliseconds := 300000
);