-- Rollback A2
DROP TRIGGER IF EXISTS trg_protect_system_profile ON public.permission_profiles;
DROP FUNCTION IF EXISTS public.fn_protect_system_profile();
-- Restaurar can_manage_permission_profiles e has_org_role a partir de snapshot-antes.sql
DROP FUNCTION IF EXISTS public.is_org_system_admin(uuid);
ALTER TABLE public.permission_profiles DROP COLUMN IF EXISTS is_system;
