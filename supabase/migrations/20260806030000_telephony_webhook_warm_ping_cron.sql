-- Warm-ping cron para o telephony-webhook: mantém a edge function "quente" e
-- evita cold starts (~1.5s) nos callbacks do Twilio (voice/route/status/transfer-*),
-- que estavam causando ~2-3s de latência por chamada (discagem e espera lentas).
-- A rota /warm da function responde 200 imediatamente, antes de qualquer auth/DB.
-- Idempotente: remove o job antigo (se houver) antes de recriar.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'telephony-webhook-warm') then
    perform cron.unschedule('telephony-webhook-warm');
  end if;
end $$;

select cron.schedule(
  'telephony-webhook-warm',
  '* * * * *',
  $$ select net.http_get(
       url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/telephony-webhook/warm',
       timeout_milliseconds := 5000
     ) $$
);
