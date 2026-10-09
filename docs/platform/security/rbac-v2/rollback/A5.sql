-- Rollback A5
DROP POLICY IF EXISTS "Org admins can update their organizations" ON public.organizations;
CREATE POLICY "Users can update their organizations" ON public.organizations FOR UPDATE TO public USING (user_has_org_access(id));
DROP TRIGGER IF EXISTS trg_protect_org_system_cols ON public.organizations;
DROP FUNCTION IF EXISTS public.fn_protect_org_system_cols();
