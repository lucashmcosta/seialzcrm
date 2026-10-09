REVOKE EXECUTE ON FUNCTION public.can_receive_cs(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_cs_round_robin(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.assign_cs_round_robin(_org uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_on boolean; v_user uuid;
BEGIN
  SELECT cs_round_robin_enabled INTO v_on FROM organizations WHERE id = _org;
  IF NOT COALESCE(v_on,false) THEN RETURN NULL; END IF;

  SELECT m.user_id INTO v_user
  FROM cs_round_robin_members m
  WHERE m.organization_id = _org AND m.active
    AND public.can_receive_cs(_org, m.user_id)
  ORDER BY (SELECT count(*) FROM message_threads t
            WHERE t.organization_id = _org AND t.assigned_user_id = m.user_id
              AND t.business_context = 'customer_service'
              AND t.status NOT IN ('resolved','closed')) ASC,
           m.last_assigned_at ASC NULLS FIRST, m.user_id ASC
  LIMIT 1
  FOR UPDATE OF m SKIP LOCKED;

  IF v_user IS NOT NULL THEN
    UPDATE cs_round_robin_members SET last_assigned_at = now()
     WHERE organization_id = _org AND user_id = v_user;
  END IF;
  RETURN v_user;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_cs_round_robin(uuid) FROM PUBLIC, anon, authenticated;