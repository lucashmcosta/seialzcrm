-- reclaim_telephony_transfer_target_v3: like v2, but accepts an optional
-- _target_user_id so the initiator can consult a DIFFERENT colleague from the
-- `with_customer` state (not only re-consult the original target). When
-- _target_user_id is NULL it behaves exactly like v2 (re-consult same target).
-- The effective target's availability/reservation are re-validated, and the
-- transfer row's target_user_id is switched when a new colleague is chosen.
-- Additive overload; v2 is left in place for the compatibility window.

CREATE OR REPLACE FUNCTION public.reclaim_telephony_transfer_target_v3(
  _transfer_id uuid,
  _initiator_user_id uuid,
  _expected_version integer,
  _target_user_id uuid DEFAULT NULL
) RETURNS SETOF public.call_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer public.call_transfers%ROWTYPE;
  v_target uuid;
  v_next_sequence integer;
BEGIN
  SELECT * INTO v_transfer FROM public.call_transfers
  WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.initiated_by_user_id <> _initiator_user_id THEN
    RETURN;
  END IF;
  IF v_transfer.state <> 'with_customer'
     OR v_transfer.version <> _expected_version THEN RETURN; END IF;

  v_target := COALESCE(_target_user_id, v_transfer.target_user_id);
  -- Cannot consult yourself.
  IF v_target = v_transfer.initiated_by_user_id THEN RETURN; END IF;

  -- Authorization/availability for the EFFECTIVE target.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    LEFT JOIN public.telephony_user_settings tus
      ON tus.organization_id = uo.organization_id AND tus.user_id = uo.user_id
    WHERE uo.organization_id = v_transfer.organization_id
      AND uo.user_id = v_target AND uo.is_active = true
      AND COALESCE((pp.permissions->>'can_receive_calls')::boolean, false) = true
      AND COALESCE(tus.receive_calls_enabled, true) = true
      AND (tus.dnd_until IS NULL OR tus.dnd_until <= now())
  ) THEN RETURN; END IF;

  -- Defensive: drop any reservation still attached to THIS transfer (e.g. the
  -- previous target) before reserving the effective target, so switching
  -- colleagues never leaves the old one reserved.
  DELETE FROM public.telephony_transfer_reservations
  WHERE transfer_id = _transfer_id;

  -- Drop stale reservations for the effective target that belong to already
  -- terminal transfers.
  DELETE FROM public.telephony_transfer_reservations r
  WHERE r.organization_id = v_transfer.organization_id
    AND r.user_id = v_target
    AND EXISTS (
      SELECT 1 FROM public.call_transfers t
      WHERE t.id = r.transfer_id
        AND t.state IN ('completed', 'canceled', 'failed')
    );

  IF EXISTS (
    SELECT 1 FROM public.telephony_transfer_reservations r
    WHERE r.organization_id = v_transfer.organization_id
      AND r.user_id = v_target
  ) OR EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_transfer.organization_id
      AND tp.user_id = v_target
      AND tp.active_call_id IS NOT NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_transfer.organization_id
      AND tp.user_id = v_target
      AND tp.status = 'available' AND tp.active_call_id IS NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) THEN RETURN; END IF;

  v_next_sequence := v_transfer.consultation_sequence + 1;
  BEGIN
    INSERT INTO public.telephony_transfer_reservations (
      organization_id, user_id, call_id, transfer_id,
      consultation_sequence, expires_at
    ) VALUES (
      v_transfer.organization_id, v_target,
      v_transfer.call_id, v_transfer.id, v_next_sequence,
      now() + interval '30 minutes'
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN;
  END;

  UPDATE public.call_transfers SET
    target_user_id = v_target,
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

REVOKE ALL ON FUNCTION public.reclaim_telephony_transfer_target_v3(
  uuid, uuid, integer, uuid
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_telephony_transfer_target_v3(
  uuid, uuid, integer, uuid
) TO service_role;
