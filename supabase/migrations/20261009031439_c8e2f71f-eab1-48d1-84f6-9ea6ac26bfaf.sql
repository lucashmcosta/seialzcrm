REVOKE EXECUTE ON FUNCTION public.rbac_v2_enabled(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_teams(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_teams(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_v2_set_global(boolean) TO authenticated, service_role;