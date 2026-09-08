CREATE OR REPLACE FUNCTION public.fn_get_push_dispatch_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_dispatch_worker_token'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.fn_get_push_dispatch_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_push_dispatch_token() FROM anon;
REVOKE ALL ON FUNCTION public.fn_get_push_dispatch_token() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_push_dispatch_token() TO service_role;