-- Criar função SECURITY DEFINER que retorna os org_ids do usuário atual
-- sem disparar RLS (evita recursão infinita)
CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    array_agg(uo.organization_id),
    '{}'::uuid[]
  )
  FROM public.user_organizations uo
  WHERE uo.user_id = public.current_user_id()
  AND uo.is_active = true
$$;

-- Dropar policy problemática que causa recursão
DROP POLICY IF EXISTS "Users can view org memberships" ON public.user_organizations;

-- Criar policy nova usando a função (sem auto-referência)
CREATE POLICY "Users can view org memberships"
ON public.user_organizations
FOR SELECT
USING (
  organization_id = ANY(public.current_user_org_ids())
);