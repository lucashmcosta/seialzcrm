-- 1. Criar função SECURITY DEFINER para pegar o user_id do usuário logado sem depender de RLS
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- 2. Dropar policy problemática de user_organizations que causa recursão
DROP POLICY IF EXISTS "Users can view their org memberships" ON public.user_organizations;

-- 3. Recriar policy de user_organizations sem recursão (usa current_user_id() ao invés de JOIN com users)
CREATE POLICY "Users can view their org memberships"
ON public.user_organizations
FOR SELECT
USING (
  user_id = public.current_user_id()
  OR public.user_has_org_access(organization_id)
);

-- 4. Dropar policy problemática de users que causa recursão
DROP POLICY IF EXISTS "Users can view members of same organization" ON public.users;

-- 5. Recriar policy de users para ver membros da mesma org (sem auto-referência)
CREATE POLICY "Users can view members of same organization"
ON public.users
FOR SELECT
USING (
  auth_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_organizations uo_me
    INNER JOIN public.user_organizations uo_other ON uo_me.organization_id = uo_other.organization_id
    WHERE uo_me.user_id = public.current_user_id()
    AND uo_me.is_active = true
    AND uo_other.user_id = users.id
    AND uo_other.is_active = true
  )
);