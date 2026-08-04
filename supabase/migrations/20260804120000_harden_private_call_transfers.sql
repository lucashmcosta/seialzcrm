-- Harden private Twilio transfers against delayed provider callbacks and
-- multiple consultation cycles on the same business call.

ALTER TABLE public.call_transfers
  ADD COLUMN IF NOT EXISTS consultation_sequence integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS provider_cleanup_pending boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_transfers_client_request
  ON public.call_transfers(organization_id, initiated_by_user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS active_transfer_id uuid
    REFERENCES public.call_transfers(id) ON DELETE SET NULL;

UPDATE public.calls c
SET active_transfer_id = t.id
FROM public.call_transfers t
WHERE t.call_id = c.id
  AND t.state NOT IN ('completed', 'canceled', 'failed')
  AND c.active_transfer_id IS NULL;

CREATE TABLE IF NOT EXISTS public.telephony_transfer_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.call_transfers(id) ON DELETE CASCADE,
  consultation_sequence integer NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_transfer_reservations_transfer
  ON public.telephony_transfer_reservations(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_reservations_expiry
  ON public.telephony_transfer_reservations(expires_at);

ALTER TABLE public.telephony_transfer_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view permitted transfer reservations"
  ON public.telephony_transfer_reservations FOR SELECT TO authenticated
  USING (
    public.user_has_org_access(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.call_transfers t
      WHERE t.id = transfer_id
        AND (
          t.initiated_by_user_id = public.current_user_id()
          OR t.target_user_id = public.current_user_id()
          OR public.user_has_telephony_permission(
            organization_id,
            'can_view_all_calls'
          )
        )
    )
  );

CREATE TABLE IF NOT EXISTS public.call_transfer_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.call_transfers(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN (
    'return_to_customer', 'consult_again', 'complete', 'cancel',
    'end_call', 'recover_to_customer'
  )),
  expected_version integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  response jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(transfer_id, request_id)
);

ALTER TABLE public.call_transfer_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transfer commands"
  ON public.call_transfer_commands FOR SELECT TO authenticated
  USING (
    public.user_has_org_access(organization_id)
    AND requested_by_user_id = public.current_user_id()
  );

-- New calls use a user-level reservation owned by the transfer. Presence
-- remains the source of online/device state, but is no longer the lock.
CREATE OR REPLACE FUNCTION public.claim_telephony_transfer_target_v2(
  _call_id uuid,
  _initiator_user_id uuid,
  _target_user_id uuid,
  _queue_name text,
  _customer_call_sid text,
  _original_agent_call_sid text,
  _request_id uuid
) RETURNS SETOF public.call_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_call public.calls%ROWTYPE;
  v_transfer public.call_transfers%ROWTYPE;
  v_existing public.call_transfers%ROWTYPE;
BEGIN
  SELECT t.* INTO v_existing
  FROM public.call_transfers t
  WHERE t.organization_id = (
    SELECT c.organization_id FROM public.calls c WHERE c.id = _call_id
  )
    AND t.initiated_by_user_id = _initiator_user_id
    AND t.client_request_id = _request_id
  LIMIT 1;
  IF FOUND THEN RETURN NEXT v_existing; RETURN; END IF;

  SELECT c.* INTO v_call FROM public.calls c WHERE c.id = _call_id FOR UPDATE;
  IF NOT FOUND OR v_call.status NOT IN ('in-progress', 'answered', 'ringing') THEN
    RAISE EXCEPTION 'call_not_transferable';
  END IF;
  IF COALESCE(v_call.current_agent_user_id, v_call.answered_by_user_id,
      v_call.initiated_by_user_id, v_call.user_id) <> _initiator_user_id THEN
    RAISE EXCEPTION 'not_current_call_agent';
  END IF;
  IF _initiator_user_id = _target_user_id THEN
    RAISE EXCEPTION 'invalid_transfer_target';
  END IF;
  IF v_call.active_transfer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.call_transfers t
    WHERE t.id = v_call.active_transfer_id
      AND t.state NOT IN ('completed', 'canceled', 'failed')
  ) THEN RAISE EXCEPTION 'call_transfer_already_active'; END IF;
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

  DELETE FROM public.telephony_transfer_reservations r
  WHERE r.organization_id = v_call.organization_id
    AND r.user_id = _target_user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.call_transfers t
        WHERE t.id = r.transfer_id
          AND t.state IN ('completed', 'canceled', 'failed')
      )
    );

  IF EXISTS (
    SELECT 1 FROM public.telephony_transfer_reservations r
    WHERE r.organization_id = v_call.organization_id
      AND r.user_id = _target_user_id
  ) OR NOT EXISTS (
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

  BEGIN
    INSERT INTO public.call_transfers (
      organization_id, call_id, initiated_by_user_id, target_user_id,
      active_user_id, queue_name, customer_call_sid, original_agent_call_sid,
      consultation_sequence, client_request_id
    ) VALUES (
      v_call.organization_id, _call_id, _initiator_user_id, _target_user_id,
      _initiator_user_id, _queue_name, _customer_call_sid,
      _original_agent_call_sid, 1, _request_id
    ) RETURNING * INTO v_transfer;
  EXCEPTION WHEN unique_violation THEN
    SELECT t.* INTO v_existing
    FROM public.call_transfers t
    WHERE t.organization_id = v_call.organization_id
      AND t.initiated_by_user_id = _initiator_user_id
      AND t.client_request_id = _request_id;
    IF FOUND THEN RETURN NEXT v_existing; RETURN; END IF;
    RAISE EXCEPTION 'call_transfer_already_active';
  END;

  BEGIN
    INSERT INTO public.telephony_transfer_reservations (
      organization_id, user_id, call_id, transfer_id,
      consultation_sequence, expires_at
    ) VALUES (
      v_call.organization_id, _target_user_id, _call_id, v_transfer.id,
      1, now() + interval '30 minutes'
    );
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.call_transfers WHERE id = v_transfer.id;
    RAISE EXCEPTION 'transfer_target_unavailable';
  END;

  UPDATE public.calls SET
    current_agent_user_id = _initiator_user_id,
    transfer_status = 'parking_customer',
    active_transfer_id = v_transfer.id
  WHERE id = _call_id;
  RETURN NEXT v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_telephony_transfer_target_v2(
  uuid, uuid, uuid, text, text, text, uuid
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telephony_transfer_target_v2(
  uuid, uuid, uuid, text, text, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.reclaim_telephony_transfer_target_v2(
  _transfer_id uuid,
  _initiator_user_id uuid,
  _expected_version integer
) RETURNS SETOF public.call_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer public.call_transfers%ROWTYPE;
  v_next_sequence integer;
BEGIN
  SELECT * INTO v_transfer FROM public.call_transfers
  WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.initiated_by_user_id <> _initiator_user_id THEN
    RETURN;
  END IF;
  IF v_transfer.state <> 'with_customer'
     OR v_transfer.version <> _expected_version THEN RETURN; END IF;

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
  ) THEN RETURN; END IF;

  DELETE FROM public.telephony_transfer_reservations r
  WHERE r.organization_id = v_transfer.organization_id
    AND r.user_id = v_transfer.target_user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.call_transfers t
        WHERE t.id = r.transfer_id
          AND t.state IN ('completed', 'canceled', 'failed')
      )
    );
  IF EXISTS (
    SELECT 1 FROM public.telephony_transfer_reservations r
    WHERE r.organization_id = v_transfer.organization_id
      AND r.user_id = v_transfer.target_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_transfer.organization_id
      AND tp.user_id = v_transfer.target_user_id
      AND tp.active_call_id IS NOT NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_transfer.organization_id
      AND tp.user_id = v_transfer.target_user_id
      AND tp.status = 'available' AND tp.active_call_id IS NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) THEN RETURN; END IF;

  v_next_sequence := v_transfer.consultation_sequence + 1;
  INSERT INTO public.telephony_transfer_reservations (
    organization_id, user_id, call_id, transfer_id,
    consultation_sequence, expires_at
  ) VALUES (
    v_transfer.organization_id, v_transfer.target_user_id,
    v_transfer.call_id, v_transfer.id, v_next_sequence,
    now() + interval '30 minutes'
  );

  UPDATE public.call_transfers SET
    state = 'parking_customer',
    consult_parent_call_sid = NULL,
    consult_target_call_sid = NULL,
    consultation_sequence = v_next_sequence,
    version = version + 1,
    failure_reason = NULL,
    updated_at = now()
  WHERE id = _transfer_id
  RETURNING * INTO v_transfer;
  UPDATE public.calls SET
    transfer_status = 'parking_customer', active_transfer_id = _transfer_id
  WHERE id = v_transfer.call_id;
  RETURN NEXT v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_telephony_transfer_target_v2(
  uuid, uuid, integer
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_telephony_transfer_target_v2(
  uuid, uuid, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_telephony_transfer_workflow(
  _transfer_id uuid,
  _initiator_user_id uuid,
  _expected_version integer
) RETURNS SETOF public.call_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_transfer public.call_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_transfer FROM public.call_transfers
  WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.initiated_by_user_id <> _initiator_user_id
    OR v_transfer.state <> 'with_customer'
    OR v_transfer.version <> _expected_version THEN RETURN; END IF;
  UPDATE public.call_transfers SET
    state = 'canceled', result = 'canceled_by_initiator',
    provider_cleanup_pending = provider_queue_sid IS NOT NULL,
    version = version + 1, completed_at = now(), updated_at = now()
  WHERE id = _transfer_id RETURNING * INTO v_transfer;
  DELETE FROM public.telephony_transfer_reservations
  WHERE transfer_id = _transfer_id;
  UPDATE public.calls SET transfer_status = 'canceled', active_transfer_id = NULL
  WHERE id = v_transfer.call_id AND active_transfer_id = _transfer_id;
  RETURN NEXT v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_telephony_transfer_workflow(
  uuid, uuid, integer
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_telephony_transfer_workflow(
  uuid, uuid, integer
) TO service_role;

-- Compatibility entrypoint used by existing callbacks. A delayed callback can
-- now release only the reservation that belongs to its own transfer.
CREATE OR REPLACE FUNCTION public.release_telephony_transfer_reservations(
  _transfer_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.telephony_transfer_reservations
  WHERE transfer_id = _transfer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_telephony_transfer_reservations(uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.release_telephony_transfer_reservations(uuid)
  TO service_role;

-- Existing in-flight transfers receive scoped reservations when possible.
INSERT INTO public.telephony_transfer_reservations (
  organization_id, user_id, call_id, transfer_id,
  consultation_sequence, expires_at
)
SELECT t.organization_id, t.target_user_id, t.call_id, t.id,
       t.consultation_sequence, now() + interval '30 minutes'
FROM public.call_transfers t
WHERE t.state IN ('parking_customer', 'customer_queued', 'consult_ringing', 'consulting')
ON CONFLICT (organization_id, user_id) DO NOTHING;
