
ALTER TABLE public.intelligence_worker_runs
  ADD COLUMN IF NOT EXISTS platform_rate_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deferred integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_batches integer,
  ADD COLUMN IF NOT EXISTS overlap_prevented boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS effective_concurrency integer,
  ADD COLUMN IF NOT EXISTS runtime_ms integer;
