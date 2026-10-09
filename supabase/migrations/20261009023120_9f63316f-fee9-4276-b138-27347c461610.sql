ALTER TABLE public.permission_profiles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
UPDATE public.permission_profiles SET is_system = true WHERE name = 'Admin';

CREATE OR REPLACE FUNCTION public.is_org_system_admin(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = public.current_user_id() AND uo.organization_id = _org
      AND uo.is_active = true AND pp.is_system = true);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_permission_profiles(_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_system_admin(_organization_id) OR public.is_admin_user();
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
      JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
     WHERE uo.user_id = _user_id AND uo.organization_id = _org_id AND uo.is_active = true
       AND CASE WHEN lower(_role) = 'admin' THEN pp.is_system ELSE lower(pp.name) = lower(_role) END);
$$;

-- Not SECURITY DEFINER on purpose: current_user reflects the caller.
CREATE OR REPLACE FUNCTION public.fn_protect_system_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.is_system THEN RAISE EXCEPTION 'system_profile_protected' USING ERRCODE='42501'; END IF;
      RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.is_system OR NEW.is_system THEN RAISE EXCEPTION 'system_profile_protected' USING ERRCODE='42501'; END IF;
    ELSIF NEW.is_system THEN
      RAISE EXCEPTION 'system_profile_protected' USING ERRCODE='42501';
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.name = 'Admin' AND NOT NEW.is_system
        AND NOT EXISTS (SELECT 1 FROM public.permission_profiles p WHERE p.organization_id = NEW.organization_id AND p.is_system) THEN
    NEW.is_system := true; -- signup/admin-create-organization seed
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_protect_system_profile ON public.permission_profiles;
CREATE TRIGGER trg_protect_system_profile BEFORE INSERT OR UPDATE OR DELETE ON public.permission_profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_system_profile();