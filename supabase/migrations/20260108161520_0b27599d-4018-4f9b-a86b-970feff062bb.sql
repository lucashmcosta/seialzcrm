-- Dropar policy atual restritiva
DROP POLICY IF EXISTS "Users can view their org memberships" ON public.user_organizations;

-- Criar policy que permite ver todos os membros da mesma organização
CREATE POLICY "Users can view org memberships"
ON public.user_organizations
FOR SELECT
USING (
  user_id = public.current_user_id()
  OR
  organization_id IN (
    SELECT uo.organization_id 
    FROM public.user_organizations uo 
    WHERE uo.user_id = public.current_user_id() 
    AND uo.is_active = true
  )
);