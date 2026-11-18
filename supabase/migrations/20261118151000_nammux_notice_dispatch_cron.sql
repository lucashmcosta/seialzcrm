-- Agendador do worker da fila de avisos ao cliente: a cada minuto.
-- A precisão do "está iniciando" (15 min antes) depende desta cadência.
-- Mesmo padrão do agent-followups: a chave interna vem do cofre.
-- Com a flag `nammux_notices` desligada em toda organização a fila fica vazia e
-- cada execução só faz duas consultas.
select cron.unschedule('nammux-notice-dispatch')
 where exists (select 1 from cron.job where jobname = 'nammux-notice-dispatch');
select cron.schedule('nammux-notice-dispatch', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/nammux-notice-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);
