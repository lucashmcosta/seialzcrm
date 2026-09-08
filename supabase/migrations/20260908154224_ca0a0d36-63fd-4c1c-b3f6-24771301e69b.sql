CREATE OR REPLACE FUNCTION public.rpc_claim_push_delivery_jobs(p_limit integer DEFAULT 25)
RETURNS SETOF public.push_delivery_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.push_delivery_jobs
    WHERE status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_delivery_jobs j
     SET status = 'running',
         attempts = j.attempts + 1,
         updated_at = now()
   WHERE j.id IN (SELECT id FROM candidates)
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_claim_push_delivery_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_claim_push_delivery_jobs(integer) TO service_role;