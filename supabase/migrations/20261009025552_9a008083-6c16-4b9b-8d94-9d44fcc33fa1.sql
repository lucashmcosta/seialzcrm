DROP POLICY IF EXISTS "Users can update their organizations" ON public.organizations;
CREATE POLICY "Org admins can update their organizations" ON public.organizations FOR UPDATE TO authenticated
USING (public.is_org_system_admin(id) OR public.is_admin_user())
WITH CHECK (public.is_org_system_admin(id) OR public.is_admin_user());

CREATE OR REPLACE FUNCTION public.fn_protect_org_system_cols()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'organization_system_column_protected' USING ERRCODE='42501';
    END IF;
    IF (NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
        OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
        OR NEW.suspended_by_admin_id IS DISTINCT FROM OLD.suspended_by_admin_id)
       AND NOT public.is_admin_user() THEN
      RAISE EXCEPTION 'organization_suspension_platform_only' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_org_system_cols ON public.organizations;
CREATE TRIGGER trg_protect_org_system_cols BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_org_system_cols();