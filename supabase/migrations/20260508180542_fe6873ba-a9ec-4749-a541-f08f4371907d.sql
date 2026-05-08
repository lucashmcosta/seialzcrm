-- =====================================================================
-- Phase 2: Integration Worker — cron + claim RPC
-- =====================================================================
-- PRÉ-REQUISITO MANUAL (antes do primeiro tick do cron):
--   No Supabase Dashboard → Settings → Vault, criar o secret:
--     name : integration_worker_token
--     value: <mesmo valor do secret INTEGRATION_WORKER_TOKEN dos edge functions>
--   O cron usa vault.read_secret('integration_worker_token') para autenticar
--   no edge function via header X-Worker-Token.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------
-- RPC: rpc_claim_integration_jobs
-- Reserva jobs prontos para execução, marca como running, incrementa attempts.
-- Usa FOR UPDATE OF j SKIP LOCKED para suportar múltiplos workers concorrentes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_claim_integration_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.integration_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT j.id
    FROM public.integration_jobs j
    JOIN public.integration_subscriptions s ON s.id = j.subscription_id
    WHERE j.status IN ('pending', 'failed')
      AND j.next_run_at <= now()
      AND j.attempts < j.max_attempts
      AND s.is_active = true
      AND (s.paused_until IS NULL OR s.paused_until <= now())
    ORDER BY j.next_run_at
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.integration_jobs j
  SET status = 'running',
      started_at = now(),
      attempts = j.attempts + 1
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*;
END;
$$;

-- ---------------------------------------------------------------------
-- Cron: integration-worker (every 30 seconds)
-- Headers obrigatórios:
--   - apikey + Authorization: anon key (gateway do Supabase exige)
--   - X-Worker-Token: validado em código pela edge function
-- ---------------------------------------------------------------------

-- Remove agendamento anterior se existir (idempotente)
SELECT cron.unschedule('integration-worker')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'integration-worker');

SELECT cron.schedule(
  'integration-worker',
  '30 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/integration-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bXR6ZnZraGtoa2hkcGNsenVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzODM3MzIsImV4cCI6MjA3OTk1OTczMn0.7uhE97klvxSwYrJMu_NYIaNCLBaIUhFNtcF2oRLYRUE',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bXR6ZnZraGtoa2hkcGNsenVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzODM3MzIsImV4cCI6MjA3OTk1OTczMn0.7uhE97klvxSwYrJMu_NYIaNCLBaIUhFNtcF2oRLYRUE',
      'X-Worker-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'integration_worker_token' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
