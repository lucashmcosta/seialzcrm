
SELECT cron.unschedule('intelligence-backfill-tick') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='intelligence-backfill-tick'
);

SELECT cron.schedule(
  'intelligence-backfill-tick',
  '*/2 * * * *',
  $$
  SELECT public.trigger_intelligence_backfill(jsonb_build_object('action','resume','run_id',r.id::text))
  FROM public.intelligence_backfill_runs r
  WHERE r.status = 'running'
  ORDER BY r.created_at DESC
  LIMIT 1;
  $$
);
