CREATE OR REPLACE FUNCTION public.fn_protect_users_system_cols()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       OR NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'users_system_column_protected' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_users_system_cols ON public.users;
CREATE TRIGGER trg_protect_users_system_cols BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_users_system_cols();