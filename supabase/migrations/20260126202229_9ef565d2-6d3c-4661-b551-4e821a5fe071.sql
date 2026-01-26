-- Política para admins verem todos os membros (ativos e inativos)
CREATE POLICY "Admins can view all org memberships"
ON user_organizations
FOR SELECT
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
);