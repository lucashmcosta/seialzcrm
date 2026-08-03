-- Telephony V2 foundation: provider-neutral numbers, explicit recipients,
-- presence, call attempts and safe organization-scoped rollout.

-- ---------------------------------------------------------------------------
-- Numbers
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_phone_numbers
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'twilio',
  ADD COLUMN IF NOT EXISTS organization_integration_id uuid REFERENCES public.organization_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_number_id text,
  ADD COLUMN IF NOT EXISTS number_type text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_default_outbound boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{"enabled":false,"schedule":{}}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS fallback_action text NOT NULL DEFAULT 'message_and_task',
  ADD COLUMN IF NOT EXISTS fallback_message text NOT NULL DEFAULT 'No momento não podemos atender. Registramos sua ligação e retornaremos em breve.',
  ADD COLUMN IF NOT EXISTS missed_call_owner_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.organization_phone_numbers
SET provider_number_id = COALESCE(provider_number_id, twilio_phone_sid),
    number_type = CASE WHEN assigned_user_id IS NULL THEN 'company' ELSE 'user' END,
    is_default_outbound = COALESCE(is_primary, false),
    max_attempts = CASE WHEN assigned_user_id IS NULL THEN 3 ELSE 1 END,
    ring_timeout_seconds = 15
WHERE provider = 'twilio';

UPDATE public.organization_phone_numbers n
SET organization_integration_id = oi.id
FROM public.organization_integrations oi
JOIN public.admin_integrations ai ON ai.id = oi.integration_id AND ai.slug = 'twilio-voice'
WHERE oi.organization_id = n.organization_id
  AND n.provider = 'twilio'
  AND n.organization_integration_id IS NULL;

DO $$ BEGIN
  ALTER TABLE public.organization_phone_numbers
    ADD CONSTRAINT organization_phone_numbers_provider_check
    CHECK (provider IN ('twilio'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.organization_phone_numbers
    ADD CONSTRAINT organization_phone_numbers_type_check
    CHECK (number_type IN ('company', 'user'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.organization_phone_numbers
    ADD CONSTRAINT organization_phone_numbers_attempts_check
    CHECK (max_attempts BETWEEN 1 AND 10 AND ring_timeout_seconds BETWEEN 5 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.organization_phone_numbers
    ADD CONSTRAINT organization_phone_numbers_user_owner_check
    CHECK (number_type <> 'user' OR assigned_user_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_phone_numbers_provider_external
  ON public.organization_phone_numbers(provider, provider_number_id)
  WHERE provider_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phone_numbers_org_active
  ON public.organization_phone_numbers(organization_id, is_active, number_type);

-- Preserve one deterministic default when legacy data has multiple primaries.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, provider ORDER BY is_primary DESC, created_at, id
  ) AS rn
  FROM public.organization_phone_numbers
  WHERE is_default_outbound = true
)
UPDATE public.organization_phone_numbers n
SET is_default_outbound = false
FROM ranked r
WHERE n.id = r.id AND r.rn > 1;

-- A personal line is selected automatically for its owner. The organization
-- default is reserved for a shared company line.
UPDATE public.organization_phone_numbers
SET is_default_outbound = false
WHERE number_type = 'user' AND is_default_outbound = true;

WITH organizations_without_default AS (
  SELECT DISTINCT organization_id, provider
  FROM public.organization_phone_numbers
  WHERE is_active = true
), first_company_number AS (
  SELECT DISTINCT ON (n.organization_id, n.provider) n.id
  FROM public.organization_phone_numbers n
  JOIN organizations_without_default o
    ON o.organization_id = n.organization_id AND o.provider = n.provider
  WHERE n.is_active = true
    AND n.number_type = 'company'
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_phone_numbers current_default
      WHERE current_default.organization_id = n.organization_id
        AND current_default.provider = n.provider
        AND current_default.is_active = true
        AND current_default.is_default_outbound = true
    )
  ORDER BY n.organization_id, n.provider, n.is_primary DESC, n.created_at, n.id
)
UPDATE public.organization_phone_numbers n
SET is_default_outbound = true
FROM first_company_number f
WHERE n.id = f.id;

DO $$ BEGIN
  ALTER TABLE public.organization_phone_numbers
    ADD CONSTRAINT organization_phone_numbers_company_default_check
    CHECK (is_default_outbound = false OR number_type = 'company');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phone_numbers_default_outbound
  ON public.organization_phone_numbers(organization_id, provider)
  WHERE is_active = true AND is_default_outbound = true;

-- ---------------------------------------------------------------------------
-- Explicit number membership and user availability
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_phone_number_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id uuid NOT NULL REFERENCES public.organization_phone_numbers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  can_receive_calls boolean NOT NULL DEFAULT false,
  can_originate_calls boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  last_offered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone_number_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_phone_number_users_routing
  ON public.organization_phone_number_users(phone_number_id, can_receive_calls, last_offered_at NULLS FIRST);

CREATE TABLE IF NOT EXISTS public.telephony_user_settings (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receive_calls_enabled boolean NOT NULL DEFAULT true,
  dnd_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.telephony_presence (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'dnd')),
  active_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_telephony_presence_eligible
  ON public.telephony_presence(organization_id, user_id, last_seen_at DESC)
  WHERE status = 'available' AND active_call_id IS NULL;

-- Snapshot legacy semantics. Future members are never implicitly authorized.
INSERT INTO public.organization_phone_number_users
  (organization_id, phone_number_id, user_id, can_receive_calls, can_originate_calls, priority)
SELECT n.organization_id, n.id, u.user_id, true, true, u.ord::integer
FROM public.organization_phone_numbers n
CROSS JOIN LATERAL unnest(COALESCE(n.ring_users, '{}'::uuid[])) WITH ORDINALITY AS u(user_id, ord)
ON CONFLICT (phone_number_id, user_id) DO UPDATE SET
  can_receive_calls = EXCLUDED.can_receive_calls,
  can_originate_calls = EXCLUDED.can_originate_calls;

INSERT INTO public.organization_phone_number_users
  (organization_id, phone_number_id, user_id, can_receive_calls, can_originate_calls, priority)
SELECT n.organization_id, n.id, uo.user_id, true, true, 100
FROM public.organization_phone_numbers n
JOIN public.user_organizations uo
  ON uo.organization_id = n.organization_id AND uo.is_active = true
WHERE n.number_type = 'company'
  AND n.ring_strategy = 'all'
ON CONFLICT (phone_number_id, user_id) DO NOTHING;

INSERT INTO public.organization_phone_number_users
  (organization_id, phone_number_id, user_id, can_receive_calls, can_originate_calls, priority)
SELECT n.organization_id, n.id, n.assigned_user_id, true, true, 1
FROM public.organization_phone_numbers n
WHERE n.number_type = 'user' AND n.assigned_user_id IS NOT NULL
ON CONFLICT (phone_number_id, user_id) DO UPDATE SET
  can_receive_calls = true,
  can_originate_calls = true,
  priority = 1;

-- Assign a deterministic missed-call owner to legacy lines.
UPDATE public.organization_phone_numbers n
SET missed_call_owner_user_id = COALESCE(
  n.assigned_user_id,
  (SELECT uo.user_id
   FROM public.user_organizations uo
   JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
   WHERE uo.organization_id = n.organization_id AND uo.is_active = true
   ORDER BY COALESCE((pp.permissions->>'can_manage_integrations')::boolean, false) DESC, uo.created_at, uo.id
   LIMIT 1)
)
WHERE n.missed_call_owner_user_id IS NULL;

-- ---------------------------------------------------------------------------
-- Calls and provider legs
-- ---------------------------------------------------------------------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'twilio',
  ADD COLUMN IF NOT EXISTS phone_number_id uuid REFERENCES public.organization_phone_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initiated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS answered_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_parent_call_id text,
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS missed_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_provider_parent_sid ON public.calls(provider, provider_parent_call_id)
  WHERE provider_parent_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_phone_number ON public.calls(phone_number_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  attempt_number integer NOT NULL,
  provider text NOT NULL DEFAULT 'twilio',
  provider_call_sid text,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(call_id, attempt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_attempts_provider_sid
  ON public.call_attempts(provider, provider_call_sid)
  WHERE provider_call_sid IS NOT NULL;

ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS call_attempt_id uuid REFERENCES public.call_attempts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_missed_call_task
  ON public.tasks(organization_id, source_external_id)
  WHERE task_type = 'missed_call' AND source_external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Permissions and RLS
-- ---------------------------------------------------------------------------
UPDATE public.permission_profiles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_make_calls', CASE WHEN name = 'Admin' THEN true ELSE COALESCE((permissions->>'can_make_calls')::boolean, false) END,
  'can_receive_calls', CASE WHEN name = 'Admin' THEN true ELSE COALESCE((permissions->>'can_receive_calls')::boolean, false) END,
  'can_view_all_calls', CASE WHEN name = 'Admin' THEN true ELSE COALESCE((permissions->>'can_view_all_calls')::boolean, false) END,
  'can_manage_telephony', CASE WHEN name = 'Admin' THEN true ELSE COALESCE((permissions->>'can_manage_telephony')::boolean, false) END
);

CREATE OR REPLACE FUNCTION public.user_has_telephony_permission(_org_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.organization_id = _org_id
      AND uo.user_id = public.current_user_id()
      AND uo.is_active = true
      AND COALESCE((pp.permissions ->> _permission)::boolean, false) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_telephony_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.telephony_v2_enabled_for_org(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_enabled = true
      AND (COALESCE(array_length(organization_ids, 1), 0) = 0 OR _org_id = ANY(organization_ids))
    FROM public.feature_flags WHERE name = 'telephony_v2' LIMIT 1
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.telephony_v2_enabled_for_org(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can manage calls in their org" ON public.calls;
CREATE POLICY "Users can view permitted calls" ON public.calls FOR SELECT TO authenticated USING (
  public.user_has_org_access(organization_id) AND (
    NOT public.telephony_v2_enabled_for_org(organization_id)
    OR public.user_has_telephony_permission(organization_id, 'can_view_all_calls')
    OR user_id = public.current_user_id()
    OR initiated_by_user_id = public.current_user_id()
    OR answered_by_user_id = public.current_user_id()
  )
);
CREATE POLICY "Users can create permitted calls" ON public.calls FOR INSERT TO authenticated WITH CHECK (
  public.user_has_org_access(organization_id) AND (
    NOT public.telephony_v2_enabled_for_org(organization_id)
    OR public.user_has_telephony_permission(organization_id, 'can_make_calls')
  )
);
CREATE POLICY "Users can update own calls" ON public.calls FOR UPDATE TO authenticated USING (
  public.user_has_org_access(organization_id) AND (
    NOT public.telephony_v2_enabled_for_org(organization_id)
    OR public.user_has_telephony_permission(organization_id, 'can_manage_telephony')
    OR user_id = public.current_user_id()
    OR initiated_by_user_id = public.current_user_id()
    OR answered_by_user_id = public.current_user_id()
  )
);

DROP POLICY IF EXISTS "Users can manage call recordings in their org" ON public.call_recordings;
CREATE POLICY "Users can view permitted call recordings" ON public.call_recordings FOR SELECT TO authenticated USING (
  public.user_has_org_access(organization_id) AND EXISTS (
    SELECT 1 FROM public.calls c WHERE c.id = call_id
  )
);

DROP POLICY IF EXISTS "Users can manage phone numbers in their org" ON public.organization_phone_numbers;
CREATE POLICY "Org members view phone numbers" ON public.organization_phone_numbers FOR SELECT TO authenticated
  USING (public.user_has_org_access(organization_id));
CREATE POLICY "Telephony managers manage phone numbers" ON public.organization_phone_numbers FOR ALL TO authenticated
  USING (
    public.user_has_org_access(organization_id) AND (
      NOT public.telephony_v2_enabled_for_org(organization_id)
      OR public.user_has_telephony_permission(organization_id, 'can_manage_telephony')
    )
  )
  WITH CHECK (
    public.user_has_org_access(organization_id) AND (
      NOT public.telephony_v2_enabled_for_org(organization_id)
      OR public.user_has_telephony_permission(organization_id, 'can_manage_telephony')
    )
  );

ALTER TABLE public.organization_phone_number_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view phone number users" ON public.organization_phone_number_users;
CREATE POLICY "Org members can view phone number users" ON public.organization_phone_number_users
  FOR SELECT TO authenticated USING (public.user_has_org_access(organization_id));
DROP POLICY IF EXISTS "Telephony managers manage phone number users" ON public.organization_phone_number_users;
CREATE POLICY "Telephony managers manage phone number users" ON public.organization_phone_number_users
  FOR ALL TO authenticated USING (public.user_has_telephony_permission(organization_id, 'can_manage_telephony'))
  WITH CHECK (public.user_has_telephony_permission(organization_id, 'can_manage_telephony'));

DROP POLICY IF EXISTS "Org members view telephony settings" ON public.telephony_user_settings;
CREATE POLICY "Org members view telephony settings" ON public.telephony_user_settings
  FOR SELECT TO authenticated USING (public.user_has_org_access(organization_id));
DROP POLICY IF EXISTS "Users manage own telephony settings" ON public.telephony_user_settings;
CREATE POLICY "Users manage own telephony settings" ON public.telephony_user_settings
  FOR ALL TO authenticated USING (user_id = public.current_user_id() AND public.user_has_org_access(organization_id))
  WITH CHECK (user_id = public.current_user_id() AND public.user_has_org_access(organization_id));
DROP POLICY IF EXISTS "Managers manage telephony settings" ON public.telephony_user_settings;
CREATE POLICY "Managers manage telephony settings" ON public.telephony_user_settings
  FOR ALL TO authenticated USING (public.user_has_telephony_permission(organization_id, 'can_manage_telephony'))
  WITH CHECK (public.user_has_telephony_permission(organization_id, 'can_manage_telephony'));

DROP POLICY IF EXISTS "Users manage own telephony presence" ON public.telephony_presence;
CREATE POLICY "Users manage own telephony presence" ON public.telephony_presence
  FOR ALL TO authenticated USING (user_id = public.current_user_id() AND public.user_has_org_access(organization_id))
  WITH CHECK (user_id = public.current_user_id() AND public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Org members view call attempts" ON public.call_attempts;
CREATE POLICY "Org members view call attempts" ON public.call_attempts
  FOR SELECT TO authenticated USING (
    public.user_has_org_access(organization_id)
    AND EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_id)
  );

-- ---------------------------------------------------------------------------
-- Schedule and atomic routing helpers (service-role callers only for claims)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.telephony_number_is_open(
  _phone_number_id uuid,
  _at timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hours jsonb;
  v_timezone text;
  v_local timestamp;
  v_time time;
  v_day text;
  v_previous_day text;
  v_segments jsonb;
  v_segment jsonb;
  v_start time;
  v_end time;
BEGIN
  SELECT n.business_hours, COALESCE(n.timezone, o.timezone, 'America/Sao_Paulo')
    INTO v_hours, v_timezone
  FROM public.organization_phone_numbers n
  JOIN public.organizations o ON o.id = n.organization_id
  WHERE n.id = _phone_number_id AND n.is_active = true;

  IF NOT FOUND THEN RETURN false; END IF;
  IF COALESCE((v_hours->>'enabled')::boolean, false) IS NOT TRUE THEN RETURN true; END IF;

  v_local := _at AT TIME ZONE v_timezone;
  v_time := v_local::time;
  v_day := (ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from v_local)::integer];
  v_previous_day := (ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from (v_local - interval '1 day'))::integer];

  v_segments := COALESCE(v_hours->'schedule'->v_day, '[]'::jsonb);
  FOR v_segment IN SELECT value FROM jsonb_array_elements(v_segments) LOOP
    v_start := (v_segment->>'start')::time;
    v_end := (v_segment->>'end')::time;
    IF (v_start <= v_end AND v_time >= v_start AND v_time < v_end)
       OR (v_start > v_end AND v_time >= v_start) THEN
      RETURN true;
    END IF;
  END LOOP;

  -- Carry the post-midnight portion of yesterday's overnight window.
  v_segments := COALESCE(v_hours->'schedule'->v_previous_day, '[]'::jsonb);
  FOR v_segment IN SELECT value FROM jsonb_array_elements(v_segments) LOOP
    v_start := (v_segment->>'start')::time;
    v_end := (v_segment->>'end')::time;
    IF v_start > v_end AND v_time < v_end THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_telephony_recipient(
  _phone_number_id uuid,
  _excluded_user_ids uuid[] DEFAULT '{}'::uuid[],
  _call_id uuid DEFAULT NULL
) RETURNS TABLE(user_id uuid, attempt_number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_number public.organization_phone_numbers%ROWTYPE;
  v_membership_id uuid;
  v_user_id uuid;
  v_excluded uuid[] := COALESCE(_excluded_user_ids, '{}'::uuid[]);
  v_reserved integer := 0;
BEGIN
  SELECT * INTO v_number
  FROM public.organization_phone_numbers
  WHERE id = _phone_number_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND OR NOT public.telephony_number_is_open(_phone_number_id, now()) THEN RETURN; END IF;

  LOOP
    v_user_id := NULL;
    v_membership_id := NULL;
    SELECT npu.id, npu.user_id INTO v_membership_id, v_user_id
    FROM public.organization_phone_number_users npu
    JOIN public.user_organizations uo
      ON uo.organization_id = npu.organization_id AND uo.user_id = npu.user_id AND uo.is_active = true
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    LEFT JOIN public.telephony_user_settings tus
      ON tus.organization_id = npu.organization_id AND tus.user_id = npu.user_id
    WHERE npu.phone_number_id = _phone_number_id
      AND npu.can_receive_calls = true
      AND npu.user_id <> ALL(v_excluded)
      AND (v_number.number_type <> 'user' OR npu.user_id = v_number.assigned_user_id)
      AND COALESCE((pp.permissions->>'can_receive_calls')::boolean, false) = true
      AND COALESCE(tus.receive_calls_enabled, true) = true
      AND (tus.dnd_until IS NULL OR tus.dnd_until <= now())
      AND EXISTS (
        SELECT 1 FROM public.telephony_presence tp
        WHERE tp.organization_id = npu.organization_id
          AND tp.user_id = npu.user_id
          AND tp.status = 'available'
          AND tp.active_call_id IS NULL
          AND tp.last_seen_at >= now() - interval '75 seconds'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.telephony_presence busy
        WHERE busy.organization_id = npu.organization_id
          AND busy.user_id = npu.user_id
          AND busy.active_call_id IS NOT NULL
          AND busy.last_seen_at >= now() - interval '75 seconds'
      )
    ORDER BY
      CASE WHEN v_number.number_type = 'user' THEN 0 ELSE npu.priority END,
      npu.last_offered_at NULLS FIRST,
      npu.id
    FOR UPDATE OF npu SKIP LOCKED
    LIMIT 1;

    IF v_user_id IS NULL THEN RETURN; END IF;
    v_reserved := 1;
    IF _call_id IS NOT NULL THEN
      UPDATE public.telephony_presence
      SET active_call_id = _call_id, last_seen_at = now()
      WHERE organization_id = v_number.organization_id
        AND user_id = v_user_id
        AND status = 'available'
        AND active_call_id IS NULL
        AND last_seen_at >= now() - interval '75 seconds';
      GET DIAGNOSTICS v_reserved = ROW_COUNT;
    END IF;
    EXIT WHEN v_reserved > 0;
    v_excluded := array_append(v_excluded, v_user_id);
  END LOOP;

  UPDATE public.organization_phone_number_users
  SET last_offered_at = now(), updated_at = now()
  WHERE id = v_membership_id;

  user_id := v_user_id;
  attempt_number := COALESCE(array_length(_excluded_user_ids, 1), 0) + 1;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_telephony_recipient(uuid, uuid[], uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_telephony_recipient(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.telephony_number_is_open(uuid, timestamptz) TO authenticated, service_role;

-- Keep active lines valid after V2 is enabled. Legacy rows were backfilled above.
CREATE OR REPLACE FUNCTION public.validate_active_telephony_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_active AND NEW.missed_call_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'active telephony number requires missed_call_owner_user_id';
  END IF;
  IF NEW.is_active AND NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.organization_id = NEW.organization_id
      AND uo.user_id = NEW.missed_call_owner_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'active telephony number requires an active missed-call owner in the organization';
  END IF;
  IF NEW.number_type = 'user' AND NEW.assigned_user_id IS NULL THEN
    RAISE EXCEPTION 'user telephony number requires assigned_user_id';
  END IF;
  IF NEW.number_type = 'user' AND NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.organization_id = NEW.organization_id
      AND uo.user_id = NEW.assigned_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'user telephony number requires an active owner in the organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_active_telephony_number ON public.organization_phone_numbers;
CREATE TRIGGER trg_validate_active_telephony_number
BEFORE INSERT OR UPDATE ON public.organization_phone_numbers
FOR EACH ROW EXECUTE FUNCTION public.validate_active_telephony_number();

INSERT INTO public.feature_flags(name, description, is_enabled, organization_ids)
SELECT 'telephony_v2', 'Telefonia unificada, presença e roteamento seguro', false, '{}'::uuid[]
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE name = 'telephony_v2');
