-- Rollback A3
DROP TRIGGER IF EXISTS trg_protect_users_system_cols ON public.users;
DROP FUNCTION IF EXISTS public.fn_protect_users_system_cols();
-- Frontend: voltar Layout.tsx/MobileLayout.tsx para userProfile?.is_platform_admin
