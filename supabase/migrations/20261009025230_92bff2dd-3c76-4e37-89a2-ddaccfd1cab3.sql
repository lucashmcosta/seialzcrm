CREATE OR REPLACE FUNCTION public.fn_guard_user_org_membership()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_me uuid; v_old_sys boolean; v_new_sys boolean; v_left int;
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  v_me := public.current_user_id();
  IF NEW.user_id = v_me AND (NEW.permission_profile_id IS DISTINCT FROM OLD.permission_profile_id
                             OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    RAISE EXCEPTION 'cannot_change_own_membership' USING ERRCODE = '42501';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'membership_identity_protected' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(is_system,false) INTO v_old_sys FROM permission_profiles WHERE id = OLD.permission_profile_id;
  SELECT coalesce(is_system,false) INTO v_new_sys FROM permission_profiles WHERE id = NEW.permission_profile_id;
  v_old_sys := coalesce(v_old_sys,false); v_new_sys := coalesce(v_new_sys,false);
  IF NEW.permission_profile_id IS DISTINCT FROM OLD.permission_profile_id AND (v_old_sys OR v_new_sys)
     AND NOT public.is_org_system_admin(NEW.organization_id) THEN
    RAISE EXCEPTION 'only_system_admin_assigns_admin' USING ERRCODE = '42501';
  END IF;
  IF OLD.is_active AND v_old_sys AND (NOT NEW.is_active OR NOT v_new_sys) THEN
    SELECT count(*) INTO v_left FROM user_organizations uo JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
     WHERE uo.organization_id = NEW.organization_id AND uo.is_active AND pp.is_system AND uo.id <> NEW.id;
    IF v_left = 0 THEN RAISE EXCEPTION 'last_system_admin' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_user_org_membership ON public.user_organizations;
CREATE TRIGGER trg_guard_user_org_membership BEFORE UPDATE ON public.user_organizations
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_user_org_membership();

CREATE OR REPLACE FUNCTION public.fn_revoke_auth_sessions(_auth_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM auth.refresh_tokens WHERE user_id = _auth_user_id::text;
  DELETE FROM auth.sessions WHERE user_id = _auth_user_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_revoke_auth_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_revoke_auth_sessions(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_revoke_sessions_on_deactivate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_auth uuid;
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    SELECT auth_user_id INTO v_auth FROM users WHERE id = NEW.user_id;
    IF v_auth IS NOT NULL THEN PERFORM public.fn_revoke_auth_sessions(v_auth); END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_revoke_sessions_on_deactivate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_revoke_sessions_on_deactivate ON public.user_organizations;
CREATE TRIGGER trg_revoke_sessions_on_deactivate AFTER UPDATE OF is_active ON public.user_organizations
FOR EACH ROW EXECUTE FUNCTION public.fn_revoke_sessions_on_deactivate();