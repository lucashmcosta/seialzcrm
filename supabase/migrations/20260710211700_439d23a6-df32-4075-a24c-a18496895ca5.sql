
CREATE TABLE IF NOT EXISTS public.intelligence_worker_leases (
  name text PRIMARY KEY,
  holder text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

GRANT ALL ON public.intelligence_worker_leases TO service_role;

ALTER TABLE public.intelligence_worker_leases ENABLE ROW LEVEL SECURITY;

-- Sem policies: apenas service_role (bypass RLS) acessa. Nenhum usuário via PostgREST anon/authenticated.

CREATE OR REPLACE FUNCTION public.try_acquire_worker_lease(
  p_name text,
  p_holder text,
  p_ttl_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_expires timestamptz := v_now + make_interval(secs => p_ttl_seconds);
  v_acquired boolean := false;
BEGIN
  INSERT INTO public.intelligence_worker_leases(name, holder, acquired_at, expires_at)
  VALUES (p_name, p_holder, v_now, v_expires)
  ON CONFLICT (name) DO UPDATE
    SET holder = EXCLUDED.holder,
        acquired_at = EXCLUDED.acquired_at,
        expires_at = EXCLUDED.expires_at
    WHERE public.intelligence_worker_leases.expires_at < v_now;

  SELECT (holder = p_holder AND expires_at = v_expires)
    INTO v_acquired
    FROM public.intelligence_worker_leases
   WHERE name = p_name;

  RETURN COALESCE(v_acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_worker_lease(
  p_name text,
  p_holder text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.intelligence_worker_leases
   WHERE name = p_name AND holder = p_holder;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_worker_lease(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_worker_lease(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_worker_lease(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_worker_lease(text, text) TO service_role;
