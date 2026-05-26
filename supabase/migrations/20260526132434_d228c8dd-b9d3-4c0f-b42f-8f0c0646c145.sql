
-- Helper to call the backfill runner using the vault-stored worker token
CREATE OR REPLACE FUNCTION public.trigger_intelligence_backfill(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_token text;
  v_req_id bigint;
  v_url text := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/intelligence-backfill-runner';
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'INTELLIGENCE_WORKER_TOKEN'
  LIMIT 1;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'INTELLIGENCE_WORKER_TOKEN not found in vault';
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-token', v_token
    ),
    body := payload,
    timeout_milliseconds := 60000
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_intelligence_backfill(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_intelligence_backfill(jsonb) TO service_role;

-- Fire WAVE 1: TEXT ONLY, last 30 days, Central Trabalhista
SELECT public.trigger_intelligence_backfill(jsonb_build_object(
  'action', 'start',
  'organization_id', '40ae935c-a7f7-4ad7-8ea4-91be6404a95f',
  'mode', 'text_only',
  'slice_hours', 6,
  'max_cost_usd', 10
));
