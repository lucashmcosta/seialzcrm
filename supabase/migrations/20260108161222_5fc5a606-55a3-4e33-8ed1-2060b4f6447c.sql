-- 1. Recriar current_user_id() em PL/pgSQL para garantir bypass de RLS
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  user_uuid uuid;
BEGIN
  SELECT id INTO user_uuid 
  FROM public.users 
  WHERE auth_user_id = auth.uid() 
  LIMIT 1;
  RETURN user_uuid;
END;
$$;

-- 2. Dropar TODAS as policies SELECT problemáticas de user_organizations
DROP POLICY IF EXISTS "Admins can view all user_organizations" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can view their org memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Users can view their organization memberships" ON public.user_organizations;

-- 3. Criar uma ÚNICA policy SELECT simplificada para user_organizations
CREATE POLICY "Users can view their org memberships"
ON public.user_organizations
FOR SELECT
USING (user_id = public.current_user_id());

-- 4. Recriar user_has_org_access() sem consultar users diretamente
CREATE OR REPLACE FUNCTION public.user_has_org_access(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = org_id
    AND uo.user_id = public.current_user_id()
    AND uo.is_active = true
  );
END;
$$;

-- 5. Dropar e recriar policy de users para ver membros da mesma org
DROP POLICY IF EXISTS "Users can view members of same organization" ON public.users;

CREATE POLICY "Users can view members of same organization"
ON public.users
FOR SELECT
USING (
  auth_user_id = auth.uid()
  OR id IN (
    SELECT uo2.user_id 
    FROM public.user_organizations uo1
    INNER JOIN public.user_organizations uo2 ON uo1.organization_id = uo2.organization_id
    WHERE uo1.user_id = public.current_user_id()
    AND uo1.is_active = true
    AND uo2.is_active = true
  )
);