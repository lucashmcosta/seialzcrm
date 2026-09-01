DROP POLICY IF EXISTS "Users can view members of same organization" ON public.users;

CREATE POLICY "Users can view members of same organization"
ON public.users
FOR SELECT
USING (
  (auth_user_id = auth.uid())
  OR (id IN (
    SELECT uo2.user_id
    FROM public.user_organizations uo1
    JOIN public.user_organizations uo2 ON uo1.organization_id = uo2.organization_id
    WHERE uo1.user_id = public.current_user_id()
      AND uo1.is_active = true
      AND uo2.is_active = true
  ))
  OR (id IN (
    SELECT uo.user_id
    FROM public.user_organizations uo
    WHERE uo.organization_id = ANY (public.current_user_managed_org_ids())
  ))
);