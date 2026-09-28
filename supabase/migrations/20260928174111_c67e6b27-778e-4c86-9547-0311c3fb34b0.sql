CREATE POLICY "Users can view deleted opportunities in trash"
ON public.opportunities FOR SELECT
USING (public.user_has_org_access(organization_id) AND deleted_at IS NOT NULL);