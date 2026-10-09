-- Rollback B3
DROP TRIGGER IF EXISTS trg_permissions_v2_to_legacy ON public.permission_profiles;
DROP FUNCTION IF EXISTS public.fn_permissions_v2_sync_legacy();
DROP FUNCTION IF EXISTS public.rbac_v2_backfill(uuid, boolean);
DROP FUNCTION IF EXISTS public.fn_permissions_to_legacy(jsonb);
DROP FUNCTION IF EXISTS public.fn_permissions_from_legacy(jsonb, boolean);
