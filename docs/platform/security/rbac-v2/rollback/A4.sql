-- Rollback A4 (sessões já revogadas não voltam; usuários fazem login de novo)
DROP TRIGGER IF EXISTS trg_guard_user_org_membership ON public.user_organizations;
DROP TRIGGER IF EXISTS trg_revoke_sessions_on_deactivate ON public.user_organizations;
DROP FUNCTION IF EXISTS public.fn_guard_user_org_membership();
DROP FUNCTION IF EXISTS public.fn_revoke_sessions_on_deactivate();
DROP FUNCTION IF EXISTS public.fn_revoke_auth_sessions(uuid);
-- Frontend/Edge: reverter UsersSettings.tsx (assignableProfiles) e create-user (checagem is_system)
