-- The resumable organic collector records a completed invocation as partial while
-- further pages remain. Keep these runs distinct from in-flight and full success.
ALTER TABLE public.meta_sync_runs
  DROP CONSTRAINT meta_sync_runs_status_check,
  ADD CONSTRAINT meta_sync_runs_status_check
    CHECK (status IN ('running', 'success', 'partial', 'error'));
