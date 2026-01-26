-- 1. Criar função que retorna org_ids onde usuário tem permissão can_manage_users
-- Usa SECURITY DEFINER + row_security = 'off' para evitar recursão
CREATE OR REPLACE FUNCTION current_user_managed_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
SET row_security = 'off'
AS $$
  SELECT COALESCE(
    array_agg(uo.organization_id),
    '{}'::uuid[]
  )
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = current_user_id()
  AND uo.is_active = true
  AND (pp.permissions->>'can_manage_users')::boolean = true
$$;

-- 2. Remover política que causa recursão infinita
DROP POLICY IF EXISTS "Admins can view all org memberships" 
ON user_organizations;

-- 3. Recriar política usando a nova função (sem recursão)
CREATE POLICY "Admins can view all org memberships"
ON user_organizations
FOR SELECT
TO authenticated
USING (
  organization_id = ANY (current_user_managed_org_ids())
);