DROP POLICY IF EXISTS capi_event_log_org_isolation ON public.capi_event_log;

CREATE POLICY capi_event_log_org_isolation
ON public.capi_event_log
FOR ALL
TO authenticated
USING (organization_id = ANY (public.current_user_org_ids()))
WITH CHECK (organization_id = ANY (public.current_user_org_ids()));