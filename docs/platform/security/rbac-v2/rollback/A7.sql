-- Rollback A7
DROP TRIGGER IF EXISTS trg_guard_soft_delete ON public.contacts;
DROP TRIGGER IF EXISTS trg_guard_soft_delete ON public.opportunities;
DROP FUNCTION IF EXISTS public.fn_guard_soft_delete();
DROP POLICY IF EXISTS "Org admins can delete contacts" ON public.contacts;
DROP POLICY IF EXISTS "Org admins can delete opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Trash: deleters view deleted contacts" ON public.contacts;
DROP POLICY IF EXISTS "Trash: deleters view deleted opportunities" ON public.opportunities;
CREATE POLICY "Users can delete contacts in their org" ON public.contacts FOR DELETE TO public USING (user_has_org_access(organization_id));
CREATE POLICY "Users can delete opportunities in their org" ON public.opportunities FOR DELETE TO public USING (user_has_org_access(organization_id));
CREATE POLICY "Users can view deleted contacts in trash" ON public.contacts FOR SELECT TO public USING (((organization_id = ANY ((SELECT current_user_org_ids())::uuid[])) AND (deleted_at IS NOT NULL)));
CREATE POLICY "Users can view deleted opportunities in trash" ON public.opportunities FOR SELECT TO public USING ((user_has_org_access(organization_id) AND (deleted_at IS NOT NULL)));
