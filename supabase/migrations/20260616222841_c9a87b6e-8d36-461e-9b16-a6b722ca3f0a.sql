CREATE POLICY "comm_endpoints_org_admin_insert"
ON public.communication_endpoints
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = ANY (current_user_org_ids())
  AND public.is_org_admin(organization_id)
);

CREATE POLICY "comm_endpoints_org_admin_update"
ON public.communication_endpoints
FOR UPDATE TO authenticated
USING (
  organization_id = ANY (current_user_org_ids())
  AND public.is_org_admin(organization_id)
)
WITH CHECK (
  organization_id = ANY (current_user_org_ids())
  AND public.is_org_admin(organization_id)
);

CREATE POLICY "comm_endpoints_org_admin_delete"
ON public.communication_endpoints
FOR DELETE TO authenticated
USING (
  organization_id = ANY (current_user_org_ids())
  AND public.is_org_admin(organization_id)
);