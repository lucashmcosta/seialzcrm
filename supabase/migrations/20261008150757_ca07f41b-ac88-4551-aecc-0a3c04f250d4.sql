DROP POLICY IF EXISTS "Users can view contacts in their org" ON public.contacts;
CREATE POLICY "Users can view contacts in their org" ON public.contacts FOR SELECT
USING (
  (select public.is_admin_user())
  OR (
    organization_id = ANY (((select public.current_user_org_ids()))::uuid[])
    AND deleted_at IS NULL
    AND (
      organization_id = ANY (((select coalesce(array_agg(o.id), '{}'::uuid[]) from unnest(public.current_user_org_ids()) as o(id) where public.user_can_view_all(o.id, 'contacts')))::uuid[])
      OR owner_user_id = (select public.current_user_id())
    )
  )
);
DROP POLICY IF EXISTS "Users can view deleted contacts in trash" ON public.contacts;
CREATE POLICY "Users can view deleted contacts in trash" ON public.contacts FOR SELECT
USING (organization_id = ANY (((select public.current_user_org_ids()))::uuid[]) AND deleted_at IS NOT NULL);