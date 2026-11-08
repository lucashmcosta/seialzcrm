-- Gasto estimado das chaves próprias de IA no mês, para a tela Provedores de IA.
-- Só para quem pode gerenciar integrações. Filtra source='customer_key': o custo pago pela
-- Seialz (managed e managed_fallback) nunca sai por aqui. Mês em UTC, igual ao limite mensal.
CREATE OR REPLACE FUNCTION public.rpc_ai_spend_summary(p_org uuid)
RETURNS TABLE(provider text, action text, calls bigint, cost_usd numeric, calls_without_cost bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT l.provider, l.action, count(*), COALESCE(sum(l.estimated_cost_usd), 0),
         count(*) FILTER (WHERE l.estimated_cost_usd IS NULL)
  FROM ai_usage_logs l
  WHERE public.can_manage_integrations_in_org(p_org)
    AND l.organization_id = p_org
    AND l.source = 'customer_key'
    AND l.provider IS NOT NULL
    AND l.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  GROUP BY l.provider, l.action;
$$;
REVOKE ALL ON FUNCTION public.rpc_ai_spend_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ai_spend_summary(uuid) TO authenticated, service_role;
