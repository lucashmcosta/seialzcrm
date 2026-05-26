
ALTER TABLE public.intelligence_backfill_runs
  DROP CONSTRAINT IF EXISTS intelligence_backfill_runs_status_check;
ALTER TABLE public.intelligence_backfill_runs
  ADD CONSTRAINT intelligence_backfill_runs_status_check
  CHECK (status = ANY (ARRAY['running','paused_manual','paused_budget','paused_rate_limit','done','error','cancelled']));

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_jobs_idempotency_key_uniq
  ON public.intelligence_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

UPDATE public.intelligence_backfill_runs
SET status = 'cancelled'
WHERE organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND status = 'error';

SELECT public.trigger_intelligence_backfill(jsonb_build_object(
  'action', 'start',
  'organization_id', '40ae935c-a7f7-4ad7-8ea4-91be6404a95f',
  'mode', 'text_only',
  'slice_hours', 6,
  'max_cost_usd', 10
));
