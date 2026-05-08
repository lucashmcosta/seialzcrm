-- =====================================================
-- PHASE 1A: Integration Service - Schema, RLS, Triggers
-- =====================================================
-- Outbox Pattern: events -> fanout -> jobs -> worker
-- Adjustments applied (per Lucas review):
--  - idempotency_key: messages uses created_at_epoch; contacts/opportunities use updated_at_epoch
--  - opportunities stage_changed emits TWO events when stage changes
--  - status check on integration_events: only 'pending' | 'published' (no 'skipped')

-- ---------- TABLES ----------

CREATE TABLE IF NOT EXISTS public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published'))
);
CREATE INDEX IF NOT EXISTS idx_integration_events_status_occurred
  ON public.integration_events(status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_integration_events_org_aggregate
  ON public.integration_events(organization_id, aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS public.integration_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_slug text NOT NULL,
  event_type text NOT NULL,
  target_action text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  paused_until timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_subscriptions_lookup
  ON public.integration_subscriptions(organization_id, integration_slug, event_type)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.integration_events(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.integration_subscriptions(id) ON DELETE CASCADE,
  integration_slug text NOT NULL,
  target_action text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','dead_letter','manual')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 8,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_error_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  external_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_due
  ON public.integration_jobs(next_run_at)
  WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_integration_jobs_org_status
  ON public.integration_jobs(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.external_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_slug text NOT NULL,
  entity_type text NOT NULL,
  internal_id uuid NOT NULL,
  external_id text NOT NULL,
  external_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced','drift','error','pending')),
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_mappings_internal_unique UNIQUE (integration_slug, entity_type, internal_id),
  CONSTRAINT external_mappings_external_unique UNIQUE (integration_slug, entity_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_external_mappings_org_entity
  ON public.external_mappings(organization_id, entity_type, internal_id);

CREATE TABLE IF NOT EXISTS public.integration_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.integration_jobs(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.integration_events(id) ON DELETE SET NULL,
  integration_slug text,
  action text NOT NULL,
  actor text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_audit_org_time
  ON public.integration_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_audit_job
  ON public.integration_audit_logs(job_id);

-- ---------- VIEW ----------

CREATE OR REPLACE VIEW public.v_entity_sync_status AS
SELECT
  organization_id,
  internal_id,
  entity_type,
  CASE
    WHEN bool_or(sync_status = 'error') THEN 'error'
    WHEN bool_or(sync_status = 'drift') THEN 'drift'
    WHEN bool_or(sync_status = 'pending') THEN 'pending'
    ELSE 'synced'
  END AS worst_status,
  max(last_synced_at) AS last_synced_at
FROM public.external_mappings
GROUP BY organization_id, internal_id, entity_type;

-- ---------- RLS ----------

ALTER TABLE public.integration_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_mappings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_audit_logs    ENABLE ROW LEVEL SECURITY;

-- SELECT policies (members of org)
DROP POLICY IF EXISTS "org members can read events"        ON public.integration_events;
DROP POLICY IF EXISTS "org members can read subscriptions" ON public.integration_subscriptions;
DROP POLICY IF EXISTS "org members can read jobs"          ON public.integration_jobs;
DROP POLICY IF EXISTS "org members can read mappings"      ON public.external_mappings;
DROP POLICY IF EXISTS "org members can read audit"         ON public.integration_audit_logs;

CREATE POLICY "org members can read events"
  ON public.integration_events FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "org members can read subscriptions"
  ON public.integration_subscriptions FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "org members can read jobs"
  ON public.integration_jobs FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "org members can read mappings"
  ON public.external_mappings FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "org members can read audit"
  ON public.integration_audit_logs FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

-- Writes are service_role only (no INSERT/UPDATE/DELETE policies = denied for non-bypass roles)

-- ---------- TRIGGER FUNCTIONS ----------

-- Defensive event publisher for contacts / opportunities / messages.
-- For opportunities UPDATE with stage change, emits TWO events.
CREATE OR REPLACE FUNCTION public.fn_publish_integration_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aggregate_type text := TG_ARGV[0];
  v_org_id uuid;
  v_event_type text;
  v_ts_epoch bigint;
  v_payload jsonb;
  v_idem text;
  v_stage_changed boolean := false;
BEGIN
  BEGIN
    -- Filter: messages only outbound
    IF v_aggregate_type = 'message' THEN
      IF NEW.direction IS DISTINCT FROM 'outbound' THEN
        RETURN NEW;
      END IF;
    END IF;

    v_org_id := NEW.organization_id;

    -- timestamp epoch: messages use created_at; others use updated_at
    IF v_aggregate_type = 'message' THEN
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.created_at, now()))::bigint;
    ELSE
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.updated_at, now()))::bigint;
    END IF;

    -- Determine event_type
    IF TG_OP = 'INSERT' THEN
      IF v_aggregate_type = 'message' THEN
        v_event_type := 'message.outbound_sent';
      ELSE
        v_event_type := v_aggregate_type || '.created';
      END IF;
    ELSE
      v_event_type := v_aggregate_type || '.updated';
      -- detect stage change for opportunities (only on UPDATE)
      IF v_aggregate_type = 'opportunity'
         AND COALESCE(OLD.pipeline_stage_id::text, '') IS DISTINCT FROM COALESCE(NEW.pipeline_stage_id::text, '') THEN
        v_stage_changed := true;
      END IF;
    END IF;

    v_payload := to_jsonb(NEW);
    v_idem := v_aggregate_type || ':' || NEW.id::text || ':' || v_event_type || ':' || v_ts_epoch::text;

    INSERT INTO public.integration_events
      (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
    VALUES
      (v_org_id, v_aggregate_type, NEW.id, v_event_type, v_payload, v_idem)
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- Second event when stage changed
    IF v_stage_changed THEN
      v_event_type := 'opportunity.stage_changed';
      v_idem := v_aggregate_type || ':' || NEW.id::text || ':' || v_event_type || ':' || v_ts_epoch::text;
      INSERT INTO public.integration_events
        (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
      VALUES
        (v_org_id, v_aggregate_type, NEW.id, v_event_type,
         v_payload || jsonb_build_object('previous_stage_id', OLD.pipeline_stage_id),
         v_idem)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_publish_integration_event failed: %', SQLERRM;
    RETURN NEW;
  END;
END;
$$;

-- Fanout: event -> jobs (one per active subscription)
CREATE OR REPLACE FUNCTION public.fn_fanout_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.integration_jobs
      (organization_id, event_id, subscription_id, integration_slug, target_action, payload, idempotency_key)
    SELECT
      NEW.organization_id,
      NEW.id,
      s.id,
      s.integration_slug,
      s.target_action,
      NEW.payload,
      NEW.idempotency_key || ':' || s.id::text
    FROM public.integration_subscriptions s
    WHERE s.organization_id = NEW.organization_id
      AND s.event_type = NEW.event_type
      AND s.is_active = true
    ON CONFLICT (idempotency_key) DO NOTHING;

    UPDATE public.integration_events
    SET status = 'published', published_at = now()
    WHERE id = NEW.id;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_fanout_event failed: %', SQLERRM;
    RETURN NEW;
  END;
END;
$$;

-- Retry scheduler used by worker
CREATE OR REPLACE FUNCTION public.fn_schedule_retry(p_job_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.integration_jobs%ROWTYPE;
  v_delay int;
  v_next_status text;
BEGIN
  SELECT * INTO v_job FROM public.integration_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_job.attempts >= v_job.max_attempts THEN
    v_next_status := 'dead_letter';
    UPDATE public.integration_jobs
    SET status='dead_letter', last_error=p_error, last_error_at=now(), completed_at=now()
    WHERE id=p_job_id;

    INSERT INTO public.integration_audit_logs (organization_id, job_id, event_id, integration_slug, action, actor, details)
    VALUES (v_job.organization_id, v_job.id, v_job.event_id, v_job.integration_slug, 'dead_letter', 'system',
            jsonb_build_object('error', p_error, 'attempts', v_job.attempts));
  ELSE
    v_delay := LEAST(power(2, v_job.attempts)::int * 30, 3600);
    UPDATE public.integration_jobs
    SET status='failed',
        last_error=p_error,
        last_error_at=now(),
        next_run_at = now() + (v_delay || ' seconds')::interval
    WHERE id=p_job_id;

    INSERT INTO public.integration_audit_logs (organization_id, job_id, event_id, integration_slug, action, actor, details)
    VALUES (v_job.organization_id, v_job.id, v_job.event_id, v_job.integration_slug, 'retry_scheduled', 'system',
            jsonb_build_object('error', p_error, 'attempts', v_job.attempts, 'next_run_at_seconds', v_delay));
  END IF;
END;
$$;

-- ---------- TRIGGERS ----------

DROP TRIGGER IF EXISTS trg_publish_event_contacts      ON public.contacts;
DROP TRIGGER IF EXISTS trg_publish_event_opportunities ON public.opportunities;
DROP TRIGGER IF EXISTS trg_publish_event_messages      ON public.messages;
DROP TRIGGER IF EXISTS trg_fanout_integration_event    ON public.integration_events;

CREATE TRIGGER trg_publish_event_contacts
  AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.fn_publish_integration_event('contact');

CREATE TRIGGER trg_publish_event_opportunities
  AFTER INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_publish_integration_event('opportunity');

CREATE TRIGGER trg_publish_event_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_publish_integration_event('message');

CREATE TRIGGER trg_fanout_integration_event
  AFTER INSERT ON public.integration_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_fanout_event();

-- ---------- RPCs (admin actions on jobs) ----------

-- Helper: check caller can manage integrations in given org
CREATE OR REPLACE FUNCTION public.can_manage_integrations_in_org(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = current_user_id()
      AND uo.organization_id = _org_id
      AND uo.is_active = true
      AND COALESCE((pp.permissions->>'can_manage_integrations')::boolean, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_retry_integration_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.integration_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.integration_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF NOT public.can_manage_integrations_in_org(v_job.organization_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  UPDATE public.integration_jobs
  SET status='pending', attempts=0, next_run_at=now(), last_error=NULL, last_error_at=NULL,
      started_at=NULL, completed_at=NULL
  WHERE id=p_job_id;

  INSERT INTO public.integration_audit_logs (organization_id, job_id, event_id, integration_slug, action, actor, details)
  VALUES (v_job.organization_id, v_job.id, v_job.event_id, v_job.integration_slug, 'manual_resolved', 'user:'||current_user_id()::text,
          jsonb_build_object('reset_to','pending'));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_resolve_integration_job_manually(p_job_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.integration_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.integration_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF NOT public.can_manage_integrations_in_org(v_job.organization_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  UPDATE public.integration_jobs
  SET status='manual', completed_at=now()
  WHERE id=p_job_id;

  INSERT INTO public.integration_audit_logs (organization_id, job_id, event_id, integration_slug, action, actor, details)
  VALUES (v_job.organization_id, v_job.id, v_job.event_id, v_job.integration_slug, 'manual_resolved', 'user:'||current_user_id()::text,
          jsonb_build_object('note', p_note));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_dismiss_integration_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.integration_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.integration_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF NOT public.can_manage_integrations_in_org(v_job.organization_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  UPDATE public.integration_jobs
  SET status='manual', completed_at=now()
  WHERE id=p_job_id;

  INSERT INTO public.integration_audit_logs (organization_id, job_id, event_id, integration_slug, action, actor, details)
  VALUES (v_job.organization_id, v_job.id, v_job.event_id, v_job.integration_slug, 'manual_skipped', 'user:'||current_user_id()::text,
          jsonb_build_object('discarded', true));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_integration_job_payload(p_job_id uuid, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.integration_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.integration_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
  IF NOT public.can_manage_integrations_in_org(v_job.organization_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;
  IF v_job.status NOT IN ('failed','dead_letter','manual') THEN
    RAISE EXCEPTION 'INVALID_STATUS_FOR_EDIT';
  END IF;

  UPDATE public.integration_jobs SET payload = p_payload WHERE id = p_job_id;

  INSERT INTO public.integration_audit_logs (organization_id, job_id, event_id, integration_slug, action, actor, details)
  VALUES (v_job.organization_id, v_job.id, v_job.event_id, v_job.integration_slug, 'payload_edited', 'user:'||current_user_id()::text,
          jsonb_build_object('previous_payload', v_job.payload));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_retry_integration_job(uuid)               FROM anon, public;
REVOKE ALL ON FUNCTION public.rpc_resolve_integration_job_manually(uuid,text) FROM anon, public;
REVOKE ALL ON FUNCTION public.rpc_dismiss_integration_job(uuid)             FROM anon, public;
REVOKE ALL ON FUNCTION public.rpc_update_integration_job_payload(uuid,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rpc_retry_integration_job(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_integration_job_manually(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dismiss_integration_job(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_integration_job_payload(uuid,jsonb) TO authenticated;