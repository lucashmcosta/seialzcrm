-- Permitir usuários verem membros da mesma organização
CREATE POLICY "Users can view members of same organization"
ON public.users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_organizations uo1
    INNER JOIN user_organizations uo2 ON uo1.organization_id = uo2.organization_id
    INNER JOIN users u ON u.id = uo1.user_id
    WHERE uo2.user_id = users.id
    AND u.auth_user_id = auth.uid()
    AND uo1.is_active = true
  )
);