CREATE OR REPLACE FUNCTION public.fn_resolve_inbound_suggested_assignee(
  _organization_id uuid,
  _endpoint_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ce.assigned_user_id
  FROM public.communication_endpoints ce
  JOIN public.user_organizations uo
    ON uo.user_id = ce.assigned_user_id
   AND uo.organization_id = ce.organization_id
   AND uo.is_active = true
  WHERE _organization_id IS NOT NULL
    AND _endpoint_id IS NOT NULL
    AND ce.id = _endpoint_id
    AND ce.organization_id = _organization_id
    AND ce.is_active = true
    AND lower(coalesce(ce.purpose, '')) = 'vendor_personal'
    AND ce.assigned_user_id IS NOT NULL
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_inbound_suggested_assignee(uuid, uuid) TO authenticated, service_role;