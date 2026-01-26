-- Remover política incorreta
DROP POLICY IF EXISTS "Admins can update org memberships" ON user_organizations;

-- Criar política corrigida usando current_user_id()
CREATE POLICY "Admins can update org memberships"
ON user_organizations
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = current_user_id() 
    AND uo.is_active = true
    AND (pp.permissions->>'can_manage_users')::boolean = true
  )
)
WITH CHECK (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = current_user_id() 
    AND uo.is_active = true
    AND (pp.permissions->>'can_manage_users')::boolean = true
  )
);