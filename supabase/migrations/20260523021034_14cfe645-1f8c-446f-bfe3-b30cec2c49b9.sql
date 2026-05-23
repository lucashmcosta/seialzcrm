
-- ============================================================
-- Outbox Stabilization v2
-- ============================================================

-- Heartbeat table for system components (reaper, worker, etc.)
CREATE TABLE IF NOT EXISTS public.outbox_system_heartbeats (
  component   text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_detail jsonb
);
ALTER TABLE public.outbox_system_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read heartbeats"
  ON public.outbox_system_heartbeats
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE auth_user_id=auth.uid() AND mfa_enabled=true));

-- Helper: is current auth user an MFA-enabled admin?
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_user_id = auth.uid() AND mfa_enabled = true
  );
$$;

-- Reaper: jobs em running > N min voltam via fn_schedule_retry
CREATE OR REPLACE FUNCTION public.fn_reap_stuck_jobs(p_threshold_minutes int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job record;
  v_count int := 0;
BEGIN
  FOR v_job IN
    SELECT id FROM public.integration_jobs
    WHERE status='running' AND started_at IS NOT NULL
      AND started_at < now() - make_interval(mins => p_threshold_minutes)
    LIMIT 500
  LOOP
    BEGIN
      PERFORM public.fn_schedule_retry(
        v_job.id,
        'reaped: stuck running > ' || p_threshold_minutes || ' min'
      );
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.integration_jobs
      SET status='failed',
          last_error='reaper fallback: ' || SQLERRM,
          last_error_at=now(),
          next_run_at = now() + interval '60 seconds'
      WHERE id = v_job.id;
    END;
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.outbox_system_heartbeats (component, last_run_at, last_detail)
  VALUES ('reaper', now(), jsonb_build_object('reaped', v_count, 'threshold_minutes', p_threshold_minutes))
  ON CONFLICT (component) DO UPDATE
    SET last_run_at = EXCLUDED.last_run_at,
        last_detail = EXCLUDED.last_detail;

  RETURN v_count;
END;
$$;

-- Internal aggregation (no role check) — só service_role acessa
CREATE OR REPLACE FUNCTION public.fn_outbox_health_summary_internal()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'pending',              (SELECT count(*) FROM integration_jobs WHERE status='pending'),
    'running',              (SELECT count(*) FROM integration_jobs WHERE status='running'),
    'running_stuck_5m',     (SELECT count(*) FROM integration_jobs WHERE status='running' AND started_at < now() - interval '5 minutes'),
    'failed',               (SELECT count(*) FROM integration_jobs WHERE status='failed'),
    'dead_letter',          (SELECT count(*) FROM integration_jobs WHERE status='dead_letter'),
    'success_24h',          (SELECT count(*) FROM integration_jobs WHERE status='success' AND completed_at > now() - interval '24 hours'),
    'failed_24h',           (SELECT count(*) FROM integration_jobs WHERE status IN ('failed','dead_letter') AND last_error_at > now() - interval '24 hours'),
    'subscriptions_active', (SELECT count(*) FROM integration_subscriptions WHERE is_active=true),
    'subscriptions_paused', (SELECT count(*) FROM integration_subscriptions WHERE is_active=false OR (paused_until IS NOT NULL AND paused_until > now())),
    'worker_last_run_at',   (SELECT max(created_at) FROM integration_audit_logs WHERE actor='integration-worker'),
    'reaper_last_run_at',   (SELECT last_run_at FROM outbox_system_heartbeats WHERE component='reaper'),
    'generated_at',         now()
  );
$$;

-- Admin-only wrapper
CREATE OR REPLACE FUNCTION public.fn_outbox_health_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_outbox_health_summary_internal();
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_outbox_retry_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid; v_event uuid; v_slug text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.integration_jobs
  SET status='failed', next_run_at=now(), last_error=NULL, last_error_at=NULL, completed_at=NULL
  WHERE id=p_job_id
  RETURNING organization_id, event_id, integration_slug INTO v_org, v_event, v_slug;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.integration_audit_logs
      (organization_id, job_id, event_id, integration_slug, action, actor, details)
    VALUES (v_org, p_job_id, v_event, v_slug, 'manual_retry', 'admin',
            jsonb_build_object('admin_auth_uid', auth.uid()));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_outbox_dismiss_job(p_job_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid; v_event uuid; v_slug text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.integration_jobs
  SET status='dead_letter', completed_at=now(), last_error=p_reason, last_error_at=now()
  WHERE id=p_job_id
  RETURNING organization_id, event_id, integration_slug INTO v_org, v_event, v_slug;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.integration_audit_logs
      (organization_id, job_id, event_id, integration_slug, action, actor, details)
    VALUES (v_org, p_job_id, v_event, v_slug, 'dismissed', 'admin',
            jsonb_build_object('reason', p_reason, 'admin_auth_uid', auth.uid()));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_outbox_pause_subscription(p_id uuid, p_until timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid; v_slug text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.integration_subscriptions
  SET paused_until = p_until
  WHERE id = p_id
  RETURNING organization_id, integration_slug INTO v_org, v_slug;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.integration_audit_logs
      (organization_id, job_id, event_id, integration_slug, action, actor, details)
    VALUES (v_org, NULL, NULL, v_slug, 'subscription_paused', 'admin',
            jsonb_build_object('subscription_id', p_id, 'paused_until', p_until, 'admin_auth_uid', auth.uid()));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_outbox_resume_subscription(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid; v_slug text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.integration_subscriptions
  SET paused_until = NULL, is_active = true
  WHERE id = p_id
  RETURNING organization_id, integration_slug INTO v_org, v_slug;

  IF v_org IS NOT NULL THEN
    INSERT INTO public.integration_audit_logs
      (organization_id, job_id, event_id, integration_slug, action, actor, details)
    VALUES (v_org, NULL, NULL, v_slug, 'subscription_resumed', 'admin',
            jsonb_build_object('subscription_id', p_id, 'admin_auth_uid', auth.uid()));
  END IF;
END;
$$;

-- GRANTs
REVOKE ALL ON FUNCTION public.fn_outbox_health_summary_internal() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reap_stuck_jobs(int)             FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_outbox_health_summary()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_outbox_retry_job(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_outbox_dismiss_job(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_outbox_pause_subscription(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_outbox_resume_subscription(uuid)            TO authenticated;

-- ============================================================
-- SANEAMENTO (one-shot)
-- ============================================================

-- A) Desativar subscriptions webhook.site
UPDATE public.integration_subscriptions
SET is_active = false
WHERE config->>'url' ILIKE '%webhook.site%';

-- B) Jobs webhook.site presos -> dead_letter + audit dismissed
WITH wh AS (
  SELECT id FROM public.integration_subscriptions WHERE config->>'url' ILIKE '%webhook.site%'
),
moved AS (
  UPDATE public.integration_jobs j
  SET status='dead_letter', completed_at=now(),
      last_error='disabled test webhook.site subscription', last_error_at=now()
  WHERE j.subscription_id IN (SELECT id FROM wh)
    AND j.status IN ('running','failed','pending')
  RETURNING j.id, j.organization_id, j.event_id, j.integration_slug
)
INSERT INTO public.integration_audit_logs
  (organization_id, job_id, event_id, integration_slug, action, actor, details)
SELECT organization_id, id, event_id, integration_slug,
       'dismissed', 'system-migration',
       jsonb_build_object('reason','disabled test webhook.site subscription')
FROM moved;

-- C) Jobs NÃO-webhook.site presos > 5min -> failed escalonado (defensivo)
WITH wh AS (
  SELECT id FROM public.integration_subscriptions WHERE config->>'url' ILIKE '%webhook.site%'
)
UPDATE public.integration_jobs
SET status='failed',
    last_error='sanitized: stuck running on migration',
    last_error_at=now(),
    next_run_at = now() + (random() * interval '10 minutes')
WHERE status='running'
  AND started_at < now() - interval '5 minutes'
  AND subscription_id NOT IN (SELECT id FROM wh);
