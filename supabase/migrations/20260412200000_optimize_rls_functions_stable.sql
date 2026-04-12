-- Performance: Marcar user_has_org_access() como STABLE
--
-- CONTEXTO:
-- PostgreSQL trata funcoes sem volatility marker como VOLATILE por default.
-- Funcoes VOLATILE sao re-executadas para CADA LINHA retornada pela query.
-- Como user_has_org_access() e usada em 172 RLS policies, isso significa:
--   - Query que retorna 100 linhas = 100 execucoes da funcao
--   - 8 usuarios navegando = milhoes de execucoes por dia
--   - Resultado: 830M seq scans na tabela users (38 registros)
--
-- SOLUCAO:
-- Marcar como STABLE indica ao PostgreSQL que, dentro de uma mesma query,
-- a funcao retorna o mesmo resultado para os mesmos parametros. O planner
-- pode cachear o resultado e reusar para todas as linhas.
--
-- SEGURANCA:
-- Isso e seguro porque:
--   1. auth.uid() nao muda dentro de uma query
--   2. user_organizations nao muda dentro de uma query
--   3. O parametro org_id e constante para queries filtradas por org
--
-- REFERENCIA:
-- Este e o padrao recomendado pela documentacao do Supabase para RLS helpers:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions
-- E o padrao usado por empresas como Neon, Clerk, e o proprio Supabase internamente.

-- 1. Recriar user_has_org_access() com STABLE
CREATE OR REPLACE FUNCTION public.user_has_org_access(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE                    -- ADICIONADO: cacheia resultado dentro da mesma query
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

-- 2. Recriar current_user_org_ids() garantindo STABLE (ja esta, mas reforcar)
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
