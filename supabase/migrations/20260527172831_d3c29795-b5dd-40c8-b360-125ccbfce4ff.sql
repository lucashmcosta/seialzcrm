
-- Onda 2a.1 — Watchdog/reaper para intelligence_jobs

-- 1. Colunas de telemetria de reclaim
ALTER TABLE public.intelligence_jobs
  ADD COLUMN IF NOT EXISTS reclaim_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reclaim_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reclaim_reason text;

CREATE INDEX IF NOT EXISTS idx_intel_jobs_running_started
  ON public.intelligence_jobs (started_at)
  WHERE status = 'running';

-- 2. Função reaper: reclama jobs presos em running
CREATE OR REPLACE FUNCTION public.intelligence_reap_stale_jobs(
  p_stale_minutes int DEFAULT 30,
  p_max_reclaims int DEFAULT 5
)
RETURNS TABLE(reclaimed int, killed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reclaimed int := 0;
  v_killed int := 0;
BEGIN
  -- Jobs que já estouraram o teto de reclaims → permanent_failure
  WITH dead AS (
    UPDATE public.intelligence_jobs
    SET status = 'permanent_failure',
        last_error = 'reaper: exceeded max reclaims ('||p_max_reclaims||')',
        last_error_at = now(),
        completed_at = now(),
        last_reclaim_reason = 'max_reclaims_exceeded'
    WHERE status = 'running'
      AND started_at < now() - (p_stale_minutes || ' minutes')::interval
      AND reclaim_count >= p_max_reclaims
    RETURNING 1
  )
  SELECT count(*) INTO v_killed FROM dead;

  -- Jobs presos abaixo do teto → reset para pending
  WITH reaped AS (
    UPDATE public.intelligence_jobs
    SET status = 'pending',
        started_at = NULL,
        reclaim_count = reclaim_count + 1,
        last_reclaim_at = now(),
        last_reclaim_reason = 'worker_stale_'||p_stale_minutes||'min',
        last_error = 'reaper: worker stale claim after '||p_stale_minutes||'min',
        last_error_at = now(),
        next_run_at = now()
    WHERE status = 'running'
      AND started_at < now() - (p_stale_minutes || ' minutes')::interval
      AND reclaim_count < p_max_reclaims
    RETURNING 1
  )
  SELECT count(*) INTO v_reclaimed FROM reaped;

  RETURN QUERY SELECT v_reclaimed, v_killed;
END;
$$;

REVOKE ALL ON FUNCTION public.intelligence_reap_stale_jobs(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intelligence_reap_stale_jobs(int, int) TO service_role;

-- 3. View de métricas de stale claims
CREATE OR REPLACE VIEW public.intelligence_stale_claims_metrics AS
SELECT
  organization_id,
  target_action,
  count(*) FILTER (WHERE status='running' AND started_at < now() - interval '30 minutes') AS stale_running_30m,
  count(*) FILTER (WHERE status='running' AND started_at < now() - interval '5 minutes')  AS stale_running_5m,
  count(*) FILTER (WHERE status='running') AS total_running,
  count(*) FILTER (WHERE reclaim_count > 0) AS ever_reclaimed,
  count(*) FILTER (WHERE reclaim_count >= 3) AS hot_reclaimed,
  max(last_reclaim_at) AS last_reclaim_at
FROM public.intelligence_jobs
GROUP BY organization_id, target_action;

GRANT SELECT ON public.intelligence_stale_claims_metrics TO service_role, authenticated;

-- 4. Cron: roda a cada 5 minutos (stale = 30min, max reclaims = 5)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'intelligence-reap-stale-jobs') THEN
    PERFORM cron.unschedule('intelligence-reap-stale-jobs');
  END IF;
END $$;

SELECT cron.schedule(
  'intelligence-reap-stale-jobs',
  '*/5 * * * *',
  $$ SELECT public.intelligence_reap_stale_jobs(30, 5); $$
);

-- 5. Execução imediata para destravar os ~1.359 jobs presos
SELECT * FROM public.intelligence_reap_stale_jobs(30, 5);
