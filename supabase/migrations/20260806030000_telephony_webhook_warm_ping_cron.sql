-- Warm-ping cron para as edge functions de telefonia: mantém-nas "quentes" e
-- evita cold starts (~1.5s cada) no caminho INTERATIVO — discagem (session-token,
-- call-intent), espera/consulta (transfer-intent), ações de transferência
-- (transfer-control) e os callbacks do Twilio (telephony-webhook). Cada função
-- tem uma rota /warm que responde 200 imediatamente, antes de qualquer auth/DB.
-- Idempotente: remove jobs antigos (se houver) antes de recriar.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'telephony-webhook-warm') then
    perform cron.unschedule('telephony-webhook-warm');
  end if;
  if exists (select 1 from cron.job where jobname = 'telephony-warm-all') then
    perform cron.unschedule('telephony-warm-all');
  end if;
end $$;

select cron.schedule(
  'telephony-warm-all',
  '* * * * *',
  $$
  select net.http_get(url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/telephony-webhook/warm', timeout_milliseconds := 5000);
  select net.http_get(url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/telephony-session-token/warm', timeout_milliseconds := 5000);
  select net.http_get(url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/telephony-call-intent/warm', timeout_milliseconds := 5000);
  select net.http_get(url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/telephony-transfer-intent/warm', timeout_milliseconds := 5000);
  select net.http_get(url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/telephony-transfer-control/warm', timeout_milliseconds := 5000);
  $$
);
