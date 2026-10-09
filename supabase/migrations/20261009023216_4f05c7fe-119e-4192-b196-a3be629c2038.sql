REVOKE EXECUTE ON FUNCTION public.is_org_system_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_system_admin(uuid) TO authenticated, service_role;