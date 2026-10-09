CREATE OR REPLACE FUNCTION public.fn_guard_soft_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_key text := CASE TG_TABLE_NAME WHEN 'contacts' THEN 'can_delete_contacts' ELSE 'can_delete_opportunities' END;
BEGIN
  IF current_user IN ('authenticated','anon')
     AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND NOT (public.is_org_system_admin(NEW.organization_id)
              OR public.user_has_org_permission(NEW.organization_id, v_key)) THEN
    RAISE EXCEPTION 'delete_permission_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_soft_delete ON public.contacts;
CREATE TRIGGER trg_guard_soft_delete BEFORE UPDATE OF deleted_at ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.fn_guard_soft_delete();
DROP TRIGGER IF EXISTS trg_guard_soft_delete ON public.opportunities;
CREATE TRIGGER trg_guard_soft_delete BEFORE UPDATE OF deleted_at ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.fn_guard_soft_delete();

DROP POLICY IF EXISTS "Users can delete contacts in their org" ON public.contacts;
CREATE POLICY "Org admins can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (public.is_org_system_admin(organization_id));
DROP POLICY IF EXISTS "Users can delete opportunities in their org" ON public.opportunities;
CREATE POLICY "Org admins can delete opportunities" ON public.opportunities FOR DELETE TO authenticated USING (public.is_org_system_admin(organization_id));

DROP POLICY IF EXISTS "Users can view deleted contacts in trash" ON public.contacts;
CREATE POLICY "Trash: deleters view deleted contacts" ON public.contacts FOR SELECT TO authenticated
USING (deleted_at IS NOT NULL AND organization_id = ANY ((SELECT public.current_user_org_ids())::uuid[])
       AND (public.is_org_system_admin(organization_id) OR public.user_has_org_permission(organization_id, 'can_delete_contacts')));
DROP POLICY IF EXISTS "Users can view deleted opportunities in trash" ON public.opportunities;
CREATE POLICY "Trash: deleters view deleted opportunities" ON public.opportunities FOR SELECT TO authenticated
USING (deleted_at IS NOT NULL AND organization_id = ANY ((SELECT public.current_user_org_ids())::uuid[])
       AND (public.is_org_system_admin(organization_id) OR public.user_has_org_permission(organization_id, 'can_delete_opportunities')));