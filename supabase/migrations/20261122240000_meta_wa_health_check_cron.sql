-- Situação dos números WhatsApp do app da plataforma (Embedded Signup) a cada 3 h:
-- qualidade, status, limite e se a conta pode enviar (health_status). Avisa os
-- administradores da org quando muda. Mesma chave interna das outras rotinas.
SELECT cron.unschedule('meta-wa-health-check') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-wa-health-check');
SELECT cron.schedule('meta-wa-health-check', '15 */3 * * *', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-wa-health-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
