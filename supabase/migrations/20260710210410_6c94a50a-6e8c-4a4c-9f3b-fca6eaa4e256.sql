
UPDATE public.intelligence_jobs
SET status = 'permanent_failure',
    completed_at = now(),
    last_error = COALESCE(last_error, '') || ' | [kill-switch lote3 2026-07-10]'
WHERE organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND status IN ('pending', 'failed');
