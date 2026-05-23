
DO $$
DECLARE v_jid bigint;
BEGIN
  SELECT jobid INTO v_jid FROM cron.job WHERE jobname = 'outbox-reaper';
  IF v_jid IS NOT NULL THEN PERFORM cron.unschedule(v_jid); END IF;
END $$;

SELECT cron.schedule(
  'outbox-reaper',
  '* * * * *',
  $$SELECT public.fn_reap_stuck_jobs(5);$$
);
