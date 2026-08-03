-- Telephony V2.1: multi-number inventory/purchases and private Queue transfers.

-- ---------------------------------------------------------------------------
-- Provider number inventory
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_phone_numbers
  ADD COLUMN IF NOT EXISTS iso_country text,
  ADD COLUMN IF NOT EXISTS number_kind text,
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_message text NOT NULL DEFAULT 'Aguarde enquanto transferimos sua ligação.',
  ADD COLUMN IF NOT EXISTS regulatory_bundle_sid text,
  ADD COLUMN IF NOT EXISTS address_sid text;

DO $$ BEGIN
  ALTER TABLE public.organization_phone_numbers
    ADD CONSTRAINT organization_phone_numbers_sync_status_check
    CHECK (sync_status IN ('synced', 'pending', 'error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Keep only the oldest active personal line when legacy data contains more
-- than one. Nothing is deleted; the duplicates remain available to managers.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, provider, assigned_user_id
    ORDER BY created_at NULLS LAST, id
  ) AS position
  FROM public.organization_phone_numbers
  WHERE is_active = true
    AND number_type = 'user'
    AND assigned_user_id IS NOT NULL
)
UPDATE public.organization_phone_numbers AS number
SET is_active = false, sync_status = 'error'
FROM ranked
WHERE number.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phone_numbers_active_personal_owner
  ON public.organization_phone_numbers(organization_id, provider, assigned_user_id)
  WHERE is_active = true AND number_type = 'user' AND assigned_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phone_numbers_provider_number_id
  ON public.organization_phone_numbers(organization_id, provider, provider_number_id)
  WHERE provider_number_id IS NOT NULL;

-- Temporary compatibility pointer for legacy consumers. The canonical source
-- remains organization_phone_numbers and no secret values leave the database.
CREATE OR REPLACE FUNCTION public.sync_twilio_default_phone_compatibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id uuid := COALESCE(NEW.organization_id, OLD.organization_id);
DECLARE v_phone text;
BEGIN
  SELECT phone_number INTO v_phone
  FROM public.organization_phone_numbers
  WHERE organization_id = v_org_id AND provider = 'twilio'
    AND number_type = 'company' AND is_active = true
    AND is_default_outbound = true
  ORDER BY created_at, id LIMIT 1;

  UPDATE public.organization_integrations oi
  SET config_values = CASE
    WHEN v_phone IS NULL THEN COALESCE(oi.config_values, '{}'::jsonb) - 'phone_number'
    ELSE jsonb_set(COALESCE(oi.config_values, '{}'::jsonb), '{phone_number}', to_jsonb(v_phone), true)
  END,
  updated_at = now()
  FROM public.admin_integrations ai
  WHERE oi.integration_id = ai.id AND ai.slug = 'twilio-voice'
    AND oi.organization_id = v_org_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_twilio_default_phone_compatibility_trigger
  ON public.organization_phone_numbers;
CREATE TRIGGER sync_twilio_default_phone_compatibility_trigger
AFTER INSERT OR UPDATE OF phone_number, provider, number_type, is_active, is_default_outbound OR DELETE
ON public.organization_phone_numbers FOR EACH ROW
EXECUTE FUNCTION public.sync_twilio_default_phone_compatibility();

CREATE TABLE IF NOT EXISTS public.telephony_number_purchase_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_integration_id uuid NOT NULL REFERENCES public.organization_integrations(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio')),
  idempotency_key text NOT NULL,
  phone_number text NOT NULL,
  iso_country text NOT NULL,
  number_kind text NOT NULL,
  number_type text NOT NULL CHECK (number_type IN ('company', 'user')),
  assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  missed_call_owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  friendly_name text,
  monthly_price numeric(12,4),
  currency text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  address_requirements text,
  regulatory_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  address_sid text,
  regulatory_bundle_sid text,
  status text NOT NULL DEFAULT 'awaiting_confirmation' CHECK (status IN (
    'awaiting_confirmation', 'purchasing', 'purchased',
    'provider_purchased_recovery_required', 'failed', 'expired'
  )),
  provider_number_id text,
  phone_number_id uuid REFERENCES public.organization_phone_numbers(id) ON DELETE SET NULL,
  error_code text,
  error_detail text,
  expires_at timestamptz NOT NULL,
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_number_purchase_intents_recovery
  ON public.telephony_number_purchase_intents(status, updated_at)
  WHERE status IN ('purchasing', 'provider_purchased_recovery_required');

CREATE UNIQUE INDEX IF NOT EXISTS uq_number_purchase_intents_open_personal_owner
  ON public.telephony_number_purchase_intents(organization_id, provider, assigned_user_id)
  WHERE number_type = 'user' AND assigned_user_id IS NOT NULL
    AND status IN ('awaiting_confirmation', 'purchasing', 'provider_purchased_recovery_required');

ALTER TABLE public.telephony_number_purchase_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Telephony managers view number purchases"
  ON public.telephony_number_purchase_intents FOR SELECT TO authenticated
  USING (public.user_has_telephony_permission(organization_id, 'can_manage_telephony'));

-- ---------------------------------------------------------------------------
-- Private transfer state
-- ---------------------------------------------------------------------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS current_agent_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_status text;

UPDATE public.calls
SET current_agent_user_id = COALESCE(answered_by_user_id, initiated_by_user_id, user_id)
WHERE current_agent_user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.call_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio')),
  initiated_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  active_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  queue_name text NOT NULL UNIQUE,
  provider_queue_sid text,
  customer_call_sid text NOT NULL,
  original_agent_call_sid text,
  consult_parent_call_sid text,
  consult_target_call_sid text,
  state text NOT NULL DEFAULT 'parking_customer' CHECK (state IN (
    'parking_customer', 'customer_queued', 'consult_ringing', 'consulting',
    'returning_to_customer', 'with_customer', 'handoff_pending',
    'completed', 'canceled', 'failed'
  )),
  result text,
  failure_reason text,
  version integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  customer_queued_at timestamptz,
  target_answered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_transfers_one_active
  ON public.call_transfers(call_id)
  WHERE state NOT IN ('completed', 'canceled', 'failed');
CREATE INDEX IF NOT EXISTS idx_call_transfers_reconcile
  ON public.call_transfers(state, updated_at)
  WHERE state NOT IN ('completed', 'canceled', 'failed');

CREATE TABLE IF NOT EXISTS public.call_transfer_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.call_transfers(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('consult_initiator', 'consult_target', 'customer_bridge')),
  sequence integer NOT NULL DEFAULT 1,
  provider text NOT NULL DEFAULT 'twilio',
  provider_call_sid text,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(transfer_id, role, sequence)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_transfer_legs_provider_sid
  ON public.call_transfer_legs(provider, provider_call_sid)
  WHERE provider_call_sid IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.call_transfer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.call_transfers(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'twilio',
  provider_event_key text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_key)
);

ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS call_transfer_leg_id uuid REFERENCES public.call_transfer_legs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS segment_type text NOT NULL DEFAULT 'customer_agent';

DO $$ BEGIN
  ALTER TABLE public.call_recordings
    ADD CONSTRAINT call_recordings_segment_type_check
    CHECK (segment_type IN ('customer_agent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.call_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transfer_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transfer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view permitted calls" ON public.calls;
CREATE POLICY "Users can view permitted calls" ON public.calls FOR SELECT TO authenticated USING (
  public.user_has_org_access(organization_id) AND (
    NOT public.telephony_v2_enabled_for_org(organization_id)
    OR public.user_has_telephony_permission(organization_id, 'can_view_all_calls')
    OR user_id = public.current_user_id()
    OR initiated_by_user_id = public.current_user_id()
    OR answered_by_user_id = public.current_user_id()
    OR current_agent_user_id = public.current_user_id()
  )
);
DROP POLICY IF EXISTS "Users can update own calls" ON public.calls;
CREATE POLICY "Users can update own calls" ON public.calls FOR UPDATE TO authenticated USING (
  public.user_has_org_access(organization_id) AND (
    NOT public.telephony_v2_enabled_for_org(organization_id)
    OR public.user_has_telephony_permission(organization_id, 'can_manage_telephony')
    OR user_id = public.current_user_id()
    OR initiated_by_user_id = public.current_user_id()
    OR answered_by_user_id = public.current_user_id()
    OR current_agent_user_id = public.current_user_id()
  )
);

CREATE POLICY "Users view permitted call transfers" ON public.call_transfers
  FOR SELECT TO authenticated USING (
    public.user_has_org_access(organization_id) AND (
      public.user_has_telephony_permission(organization_id, 'can_view_all_calls')
      OR initiated_by_user_id = public.current_user_id()
      OR target_user_id = public.current_user_id()
      OR EXISTS (
        SELECT 1 FROM public.calls c
        WHERE c.id = call_id AND c.current_agent_user_id = public.current_user_id()
      )
    )
  );
CREATE POLICY "Users view permitted transfer legs" ON public.call_transfer_legs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.call_transfers t WHERE t.id = transfer_id)
  );
CREATE POLICY "Users view permitted transfer events" ON public.call_transfer_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.call_transfers t WHERE t.id = transfer_id)
  );

-- ---------------------------------------------------------------------------
-- Permission, rollout and atomic target reservation
-- ---------------------------------------------------------------------------
UPDATE public.permission_profiles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_transfer_calls',
    CASE WHEN name = 'Admin' THEN true
    ELSE COALESCE((permissions->>'can_transfer_calls')::boolean,
      COALESCE((permissions->>'can_make_calls')::boolean, false)) END
);

INSERT INTO public.feature_flags(name, description, is_enabled, organization_ids)
VALUES (
  'telephony_transfer_v1',
  'Transferência privada de chamadas usando fila Twilio exclusiva',
  true,
  ARRAY['b246ef6f-6242-4011-a112-6d8783d2896a'::uuid]
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_enabled = true,
  organization_ids = EXCLUDED.organization_ids,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.telephony_transfer_enabled_for_org(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_enabled = true
      AND (COALESCE(array_length(organization_ids, 1), 0) = 0 OR _org_id = ANY(organization_ids))
    FROM public.feature_flags WHERE name = 'telephony_transfer_v1' LIMIT 1
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.telephony_transfer_enabled_for_org(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_telephony_transfer_target(
  _call_id uuid,
  _initiator_user_id uuid,
  _target_user_id uuid,
  _queue_name text,
  _customer_call_sid text,
  _original_agent_call_sid text DEFAULT NULL
) RETURNS SETOF public.call_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_call public.calls%ROWTYPE;
  v_transfer public.call_transfers%ROWTYPE;
  v_reserved integer := 0;
BEGIN
  SELECT c.* INTO v_call FROM public.calls c WHERE c.id = _call_id FOR UPDATE;
  IF NOT FOUND OR v_call.status NOT IN ('in-progress', 'answered', 'ringing') THEN
    RAISE EXCEPTION 'call_not_transferable';
  END IF;
  IF COALESCE(v_call.current_agent_user_id, v_call.answered_by_user_id, v_call.initiated_by_user_id, v_call.user_id) <> _initiator_user_id THEN
    RAISE EXCEPTION 'not_current_call_agent';
  END IF;
  IF _initiator_user_id = _target_user_id THEN RAISE EXCEPTION 'invalid_transfer_target'; END IF;
  IF NOT public.telephony_transfer_enabled_for_org(v_call.organization_id) THEN
    RAISE EXCEPTION 'telephony_transfer_disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    LEFT JOIN public.telephony_user_settings tus
      ON tus.organization_id = uo.organization_id AND tus.user_id = uo.user_id
    WHERE uo.organization_id = v_call.organization_id
      AND uo.user_id = _target_user_id AND uo.is_active = true
      AND COALESCE((pp.permissions->>'can_receive_calls')::boolean, false) = true
      AND COALESCE(tus.receive_calls_enabled, true) = true
      AND (tus.dnd_until IS NULL OR tus.dnd_until <= now())
  ) THEN RAISE EXCEPTION 'transfer_target_not_authorized'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_call.organization_id
      AND tp.user_id = _target_user_id
      AND tp.status = 'available' AND tp.active_call_id IS NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) OR EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_call.organization_id
      AND tp.user_id = _target_user_id
      AND tp.active_call_id IS NOT NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) THEN RAISE EXCEPTION 'transfer_target_unavailable'; END IF;

  UPDATE public.telephony_presence tp
  SET active_call_id = _call_id, last_seen_at = now()
  WHERE tp.organization_id = v_call.organization_id
    AND tp.user_id = _target_user_id
    AND tp.status = 'available' AND tp.active_call_id IS NULL
    AND tp.last_seen_at >= now() - interval '75 seconds';
  GET DIAGNOSTICS v_reserved = ROW_COUNT;
  IF v_reserved = 0 THEN RAISE EXCEPTION 'transfer_target_unavailable'; END IF;

  BEGIN
    INSERT INTO public.call_transfers (
      organization_id, call_id, initiated_by_user_id, target_user_id,
      active_user_id, queue_name, customer_call_sid, original_agent_call_sid
    ) VALUES (
      v_call.organization_id, _call_id, _initiator_user_id, _target_user_id,
      _initiator_user_id, _queue_name, _customer_call_sid, _original_agent_call_sid
    ) RETURNING * INTO v_transfer;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.telephony_presence tp SET active_call_id = NULL
    WHERE tp.organization_id = v_call.organization_id
      AND tp.user_id = _target_user_id AND tp.active_call_id = _call_id;
    RAISE EXCEPTION 'call_transfer_already_active';
  END;

  UPDATE public.calls SET
    current_agent_user_id = _initiator_user_id,
    transfer_status = 'parking_customer'
  WHERE id = _call_id;
  RETURN NEXT v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_telephony_transfer_target(uuid, uuid, uuid, text, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telephony_transfer_target(uuid, uuid, uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reclaim_telephony_transfer_target(
  _transfer_id uuid,
  _initiator_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_transfer public.call_transfers%ROWTYPE; v_reserved integer := 0;
BEGIN
  SELECT * INTO v_transfer FROM public.call_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.initiated_by_user_id <> _initiator_user_id
     OR v_transfer.state <> 'with_customer' THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    LEFT JOIN public.telephony_user_settings tus
      ON tus.organization_id = uo.organization_id AND tus.user_id = uo.user_id
    WHERE uo.organization_id = v_transfer.organization_id
      AND uo.user_id = v_transfer.target_user_id AND uo.is_active = true
      AND COALESCE((pp.permissions->>'can_receive_calls')::boolean, false) = true
      AND COALESCE(tus.receive_calls_enabled, true) = true
      AND (tus.dnd_until IS NULL OR tus.dnd_until <= now())
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_transfer.organization_id
      AND tp.user_id = v_transfer.target_user_id
      AND tp.active_call_id IS NOT NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) THEN RETURN false; END IF;
  UPDATE public.telephony_presence tp SET active_call_id = v_transfer.call_id, last_seen_at = now()
  WHERE tp.organization_id = v_transfer.organization_id
    AND tp.user_id = v_transfer.target_user_id
    AND tp.status = 'available' AND tp.active_call_id IS NULL
    AND tp.last_seen_at >= now() - interval '75 seconds';
  GET DIAGNOSTICS v_reserved = ROW_COUNT;
  IF v_reserved = 0 THEN RETURN false; END IF;
  UPDATE public.call_transfers SET
    state = 'parking_customer', consult_parent_call_sid = NULL,
    consult_target_call_sid = NULL, version = version + 1, updated_at = now()
  WHERE id = _transfer_id;
  UPDATE public.calls SET transfer_status = 'parking_customer' WHERE id = v_transfer.call_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reclaim_telephony_transfer_target(uuid, uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_telephony_transfer_target(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_telephony_transfer_reservations(_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_transfer public.call_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_transfer FROM public.call_transfers WHERE id = _transfer_id;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.telephony_presence tp SET active_call_id = NULL
  WHERE tp.organization_id = v_transfer.organization_id
    AND tp.user_id IN (v_transfer.initiated_by_user_id, v_transfer.target_user_id)
    AND tp.active_call_id = v_transfer.call_id;
END;
$$;
REVOKE ALL ON FUNCTION public.release_telephony_transfer_reservations(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.release_telephony_transfer_reservations(uuid) TO service_role;

-- Reconcile abandoned provider queues and stale reservations. The function
-- authenticates the service_role JWT itself.
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'telephony-transfer-reconcile';
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
    PERFORM cron.schedule(
      'telephony-transfer-reconcile',
      '*/2 * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/telephony-transfer-reconcile',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
            )
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 60000
        );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'telephony-transfer-reconcile schedule skipped: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
