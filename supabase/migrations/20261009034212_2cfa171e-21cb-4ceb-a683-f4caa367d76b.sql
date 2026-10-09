CREATE OR REPLACE FUNCTION public.rbac_v2_delete_profile(_profile uuid, _target uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_sys boolean; t_org uuid; n integer;
BEGIN
  SELECT organization_id, is_system INTO v_org, v_sys FROM permission_profiles WHERE id = _profile;
  IF v_org IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0002'; END IF;
  IF NOT (public.is_org_system_admin(v_org) OR public.is_admin_user()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_sys THEN RAISE EXCEPTION 'system_profile_protected' USING ERRCODE='42501'; END IF;
  IF _target IS NULL OR _target = _profile THEN RAISE EXCEPTION 'target_required' USING ERRCODE='22023'; END IF;
  SELECT organization_id INTO t_org FROM permission_profiles WHERE id = _target;
  IF t_org IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'target_invalid' USING ERRCODE='22023'; END IF;
  UPDATE user_organizations SET permission_profile_id = _target WHERE permission_profile_id = _profile AND organization_id = v_org;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM permission_profiles WHERE id = _profile;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.rbac_v2_delete_profile(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rbac_v2_delete_profile(uuid,uuid) TO authenticated, service_role;