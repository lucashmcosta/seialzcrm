-- Decouple "hold" (espera) from "transfer": an agent can park the customer with
-- hold music WITHOUT choosing a colleague, then independently decide to resume
-- or to consult/transfer a colleague. Mirrors the DivusApp ParkedClientBanner
-- model. Adds an `on_hold` resting state and makes target_user_id nullable
-- (a pure hold has no target yet).

ALTER TABLE public.call_transfers ALTER COLUMN target_user_id DROP NOT NULL;

ALTER TABLE public.call_transfer_commands DROP CONSTRAINT IF EXISTS call_transfer_commands_action_check;
ALTER TABLE public.call_transfer_commands ADD CONSTRAINT call_transfer_commands_action_check
  CHECK (action IN (
    'return_to_customer', 'consult_again', 'complete', 'cancel',
    'end_call', 'recover_to_customer', 'resume', 'consult'
  ));

ALTER TABLE public.call_transfers DROP CONSTRAINT IF EXISTS call_transfers_state_check;
ALTER TABLE public.call_transfers ADD CONSTRAINT call_transfers_state_check
  CHECK (state = ANY (ARRAY[
    'parking_customer', 'customer_queued', 'consult_ringing', 'consulting',
    'returning_to_customer', 'with_customer', 'handoff_pending',
    'on_hold', 'completed', 'canceled', 'failed'
  ]));

-- Park the customer with no colleague reserved. Idempotent by client_request_id.
CREATE OR REPLACE FUNCTION public.hold_telephony_call(
  _call_id uuid,
  _initiator_user_id uuid,
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
  SELECT t.* INTO v_existing FROM public.call_transfers t
  WHERE t.organization_id = (SELECT c.organization_id FROM public.calls c WHERE c.id = _call_id)
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
  IF v_call.active_transfer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.call_transfers t
    WHERE t.id = v_call.active_transfer_id
      AND t.state NOT IN ('completed', 'canceled', 'failed')
  ) THEN RAISE EXCEPTION 'call_transfer_already_active'; END IF;

  BEGIN
    INSERT INTO public.call_transfers (
      organization_id, call_id, initiated_by_user_id, target_user_id,
      active_user_id, queue_name, customer_call_sid, original_agent_call_sid,
      consultation_sequence, client_request_id, state
    ) VALUES (
      v_call.organization_id, _call_id, _initiator_user_id, NULL,
      _initiator_user_id, _queue_name, _customer_call_sid,
      _original_agent_call_sid, 1, _request_id, 'parking_customer'
    ) RETURNING * INTO v_transfer;
  EXCEPTION WHEN unique_violation THEN
    SELECT t.* INTO v_existing FROM public.call_transfers t
    WHERE t.organization_id = v_call.organization_id
      AND t.initiated_by_user_id = _initiator_user_id
      AND t.client_request_id = _request_id;
    IF FOUND THEN RETURN NEXT v_existing; RETURN; END IF;
    RAISE EXCEPTION 'call_transfer_already_active';
  END;

  UPDATE public.calls SET
    current_agent_user_id = _initiator_user_id,
    transfer_status = 'parking_customer',
    active_transfer_id = v_transfer.id
  WHERE id = _call_id;
  RETURN NEXT v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.hold_telephony_call(uuid, uuid, text, text, text, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_telephony_call(uuid, uuid, text, text, text, uuid)
  TO service_role;

-- Reserve a colleague for a call that is ALREADY on hold (customer parked).
-- Unlike reclaim_v*, it does not re-park; it only reserves the target and moves
-- the transfer to customer_queued so the browser can dial the colleague.
CREATE OR REPLACE FUNCTION public.reserve_telephony_transfer_target(
  _transfer_id uuid,
  _initiator_user_id uuid,
  _expected_version integer,
  _target_user_id uuid
) RETURNS SETOF public.call_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer public.call_transfers%ROWTYPE;
  v_next_sequence integer;
BEGIN
  SELECT * INTO v_transfer FROM public.call_transfers
  WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.initiated_by_user_id <> _initiator_user_id THEN RETURN; END IF;
  IF v_transfer.state <> 'on_hold' OR v_transfer.version <> _expected_version THEN RETURN; END IF;
  IF _target_user_id = v_transfer.initiated_by_user_id THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    LEFT JOIN public.telephony_user_settings tus
      ON tus.organization_id = uo.organization_id AND tus.user_id = uo.user_id
    WHERE uo.organization_id = v_transfer.organization_id
      AND uo.user_id = _target_user_id AND uo.is_active = true
      AND COALESCE((pp.permissions->>'can_receive_calls')::boolean, false) = true
      AND COALESCE(tus.receive_calls_enabled, true) = true
      AND (tus.dnd_until IS NULL OR tus.dnd_until <= now())
  ) THEN RETURN; END IF;

  DELETE FROM public.telephony_transfer_reservations WHERE transfer_id = _transfer_id;
  DELETE FROM public.telephony_transfer_reservations r
  WHERE r.organization_id = v_transfer.organization_id AND r.user_id = _target_user_id
    AND EXISTS (SELECT 1 FROM public.call_transfers t
                WHERE t.id = r.transfer_id AND t.state IN ('completed','canceled','failed'));

  IF EXISTS (
    SELECT 1 FROM public.telephony_transfer_reservations r
    WHERE r.organization_id = v_transfer.organization_id AND r.user_id = _target_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_transfer.organization_id AND tp.user_id = _target_user_id
      AND tp.active_call_id IS NOT NULL AND tp.last_seen_at >= now() - interval '75 seconds'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.telephony_presence tp
    WHERE tp.organization_id = v_transfer.organization_id AND tp.user_id = _target_user_id
      AND tp.status = 'available' AND tp.active_call_id IS NULL
      AND tp.last_seen_at >= now() - interval '75 seconds'
  ) THEN RETURN; END IF;

  v_next_sequence := v_transfer.consultation_sequence + 1;
  BEGIN
    INSERT INTO public.telephony_transfer_reservations (
      organization_id, user_id, call_id, transfer_id, consultation_sequence, expires_at
    ) VALUES (
      v_transfer.organization_id, _target_user_id, v_transfer.call_id, v_transfer.id,
      v_next_sequence, now() + interval '30 minutes'
    );
  EXCEPTION WHEN unique_violation THEN RETURN; END;

  UPDATE public.call_transfers SET
    target_user_id = _target_user_id,
    state = 'customer_queued',
    consult_parent_call_sid = NULL,
    consult_target_call_sid = NULL,
    consultation_sequence = v_next_sequence,
    version = version + 1,
    failure_reason = NULL,
    updated_at = now()
  WHERE id = _transfer_id
  RETURNING * INTO v_transfer;
  UPDATE public.calls SET transfer_status = 'customer_queued', active_transfer_id = _transfer_id
  WHERE id = v_transfer.call_id;
  RETURN NEXT v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_telephony_transfer_target(uuid, uuid, integer, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_telephony_transfer_target(uuid, uuid, integer, uuid)
  TO service_role;
