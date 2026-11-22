-- Robô das réguas a cada minuto (mesma chave interna das outras rotinas).
-- Sem régua ligada, cada execução só faz uma consulta vazia.
SELECT cron.unschedule('cadence-dispatch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cadence-dispatch');
SELECT cron.schedule('cadence-dispatch', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/cadence-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
