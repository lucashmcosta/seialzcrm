-- Rollback B1/B2
DROP FUNCTION IF EXISTS public.rbac_v2_set_global(boolean);
DROP FUNCTION IF EXISTS public.rbac_v2_enabled(uuid);
DELETE FROM public.feature_flags WHERE name = 'rbac_v2';
DROP TABLE IF EXISTS public.team_members;
DROP TABLE IF EXISTS public.teams;
ALTER TABLE public.permission_profiles DROP COLUMN IF EXISTS permissions_v2;
