-- Qualify presence columns because RETURNS TABLE exposes an output variable
-- named user_id. With a real call id, the unqualified UPDATE raised 42702
-- before any call attempt could be created.
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
  SELECT n.* INTO v_number
  FROM public.organization_phone_numbers AS n
  WHERE n.id = _phone_number_id AND n.is_active = true
  FOR UPDATE;

  IF NOT FOUND OR NOT public.telephony_number_is_open(_phone_number_id, now()) THEN RETURN; END IF;

  LOOP
    v_user_id := NULL;
    v_membership_id := NULL;
    SELECT npu.id, npu.user_id INTO v_membership_id, v_user_id
    FROM public.organization_phone_number_users AS npu
    JOIN public.user_organizations AS uo
      ON uo.organization_id = npu.organization_id AND uo.user_id = npu.user_id AND uo.is_active = true
    JOIN public.permission_profiles AS pp ON pp.id = uo.permission_profile_id
    LEFT JOIN public.telephony_user_settings AS tus
      ON tus.organization_id = npu.organization_id AND tus.user_id = npu.user_id
    WHERE npu.phone_number_id = _phone_number_id
      AND npu.can_receive_calls = true
      AND npu.user_id <> ALL(v_excluded)
      AND (v_number.number_type <> 'user' OR npu.user_id = v_number.assigned_user_id)
      AND COALESCE((pp.permissions->>'can_receive_calls')::boolean, false) = true
      AND COALESCE(tus.receive_calls_enabled, true) = true
      AND (tus.dnd_until IS NULL OR tus.dnd_until <= now())
      AND EXISTS (
        SELECT 1 FROM public.telephony_presence AS tp
        WHERE tp.organization_id = npu.organization_id
          AND tp.user_id = npu.user_id
          AND tp.status = 'available'
          AND tp.active_call_id IS NULL
          AND tp.last_seen_at >= now() - interval '75 seconds'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.telephony_presence AS busy
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
      UPDATE public.telephony_presence AS tp
      SET active_call_id = _call_id, last_seen_at = now()
      WHERE tp.organization_id = v_number.organization_id
        AND tp.user_id = v_user_id
        AND tp.status = 'available'
        AND tp.active_call_id IS NULL
        AND tp.last_seen_at >= now() - interval '75 seconds';
      GET DIAGNOSTICS v_reserved = ROW_COUNT;
    END IF;
    EXIT WHEN v_reserved > 0;
    v_excluded := array_append(v_excluded, v_user_id);
  END LOOP;

  UPDATE public.organization_phone_number_users AS npu
  SET last_offered_at = now(), updated_at = now()
  WHERE npu.id = v_membership_id;

  user_id := v_user_id;
  attempt_number := COALESCE(array_length(_excluded_user_ids, 1), 0) + 1;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_telephony_recipient(uuid, uuid[], uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_telephony_recipient(uuid, uuid[], uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
