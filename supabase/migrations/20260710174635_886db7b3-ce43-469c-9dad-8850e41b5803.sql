
CREATE TABLE IF NOT EXISTS public.intelligence_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  processed integer NOT NULL DEFAULT 0,
  success integer NOT NULL DEFAULT 0,
  retryable integer NOT NULL DEFAULT 0,
  permanent integer NOT NULL DEFAULT 0,
  no_handler integer NOT NULL DEFAULT 0,
  http_429 integer NOT NULL DEFAULT 0,
  http_5xx integer NOT NULL DEFAULT 0,
  network_error integer NOT NULL DEFAULT 0,
  jobs_per_min numeric NOT NULL DEFAULT 0,
  latency_avg_ms integer NOT NULL DEFAULT 0,
  latency_p95_ms integer NOT NULL DEFAULT 0,
  final_concurrency integer NOT NULL DEFAULT 0,
  circuit_breaker_tripped boolean NOT NULL DEFAULT false,
  circuit_breaker_reason text,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_worker_runs_started_at
  ON public.intelligence_worker_runs (started_at DESC);

GRANT SELECT ON public.intelligence_worker_runs TO authenticated;
GRANT ALL ON public.intelligence_worker_runs TO service_role;

ALTER TABLE public.intelligence_worker_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_intelligence_worker_runs" ON public.intelligence_worker_runs;
CREATE POLICY "admins_read_intelligence_worker_runs"
  ON public.intelligence_worker_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.auth_user_id = auth.uid()
        AND au.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION public.prune_intelligence_worker_runs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.intelligence_worker_runs
  WHERE started_at < now() - interval '30 days';
$$;
