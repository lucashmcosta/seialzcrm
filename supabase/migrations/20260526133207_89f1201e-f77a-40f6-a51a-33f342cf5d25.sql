
DROP INDEX IF EXISTS public.intelligence_jobs_idempotency_key_uniq;
ALTER TABLE public.intelligence_jobs
  ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE public.intelligence_jobs
  ADD CONSTRAINT intelligence_jobs_idempotency_key_key UNIQUE (idempotency_key);

UPDATE public.intelligence_backfill_runs
SET status='cancelled'
WHERE organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f' AND status='error';

SELECT public.trigger_intelligence_backfill(jsonb_build_object(
  'action','start',
  'organization_id','40ae935c-a7f7-4ad7-8ea4-91be6404a95f',
  'mode','text_only',
  'slice_hours',6,
  'max_cost_usd',10
));
