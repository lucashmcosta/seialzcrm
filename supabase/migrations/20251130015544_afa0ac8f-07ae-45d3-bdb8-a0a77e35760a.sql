-- Corrigir search_path da função is_admin_user
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users au
    WHERE au.auth_user_id = auth.uid()
    AND au.is_active = true
    AND au.mfa_enabled = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;