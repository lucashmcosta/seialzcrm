CREATE OR REPLACE FUNCTION public.fn_scheduler_health_summary(_window interval DEFAULT '1 hour')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron, pg_temp
AS $$
  WITH recent AS (
    -- Bounded by runid (PK) because job_run_details has no start_time index.
    SELECT d.jobid, d.status, d.start_time, d.end_time
    FROM cron.job_run_details d
    ORDER BY d.runid DESC
    LIMIT 5000
  ),
  jobs AS (SELECT j.jobid, j.jobname, j.schedule, j.active FROM cron.job j),
  runs AS (
    SELECT jobid, count(*) AS runs,
           count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
           count(*) FILTER (WHERE status = 'failed') AS failed
    FROM recent WHERE start_time >= now() - _window GROUP BY jobid
  ),
  last_run AS (
    SELECT DISTINCT ON (jobid) jobid, status, start_time, end_time
    FROM recent ORDER BY jobid, start_time DESC
  )
  SELECT jsonb_build_object(
    'window_seconds', extract(epoch FROM _window)::int,
    'last_run_at', (SELECT max(start_time) FROM recent),
    'jobs_total',  (SELECT count(*) FROM jobs),
    'jobs_active', (SELECT count(*) FROM jobs WHERE active),
    'runs',        coalesce((SELECT sum(runs) FROM runs), 0),
    'succeeded',   coalesce((SELECT sum(succeeded) FROM runs), 0),
    'failed',      coalesce((SELECT sum(failed) FROM runs), 0),
    'running_stuck_15m', (SELECT count(*) FROM recent
                          WHERE status IN ('running','starting')
                            AND start_time < now() - interval '15 minutes'),
    'jobs', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_status', l.status, 'last_start', l.start_time,
        'duration_ms', (extract(epoch FROM (l.end_time - l.start_time)) * 1000)::int,
        'failed_in_window', coalesce(r.failed, 0)
      ) ORDER BY j.jobname)
      FROM jobs j LEFT JOIN last_run l USING (jobid) LEFT JOIN runs r USING (jobid)), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_scheduler_health_summary(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_scheduler_health_summary(interval) TO service_role;