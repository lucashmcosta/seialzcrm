-- Permitir que admins da organização atualizem membros
-- A permissão está no campo JSONB "permissions" do permission_profiles
CREATE POLICY "Admins can update org memberships"
ON user_organizations
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = auth.uid() 
    AND uo.is_active = true
    AND (pp.permissions->>'can_manage_users')::boolean = true
  )
)
WITH CHECK (
  organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = auth.uid() 
    AND uo.is_active = true
    AND (pp.permissions->>'can_manage_users')::boolean = true
  )
);