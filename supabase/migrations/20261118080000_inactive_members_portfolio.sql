-- Quanto cada usuário INATIVO ainda tem de carteira (para a lista de usuários mostrar o que falta
-- transferir e esconder o botão de quem já está zerado). Só administrador do sistema da org.
CREATE OR REPLACE FUNCTION public.rpc_inactive_members_portfolio_v1(p_organization_id uuid)
RETURNS TABLE (user_id uuid, contacts bigint, threads bigint, opportunities bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_system_admin(p_organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH inactive AS (
    SELECT uo.user_id FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id AND NOT uo.is_active
  ), c AS (
    SELECT owner_user_id AS uid, count(*) n FROM contacts
    WHERE organization_id = p_organization_id AND deleted_at IS NULL AND owner_user_id IN (SELECT i.user_id FROM inactive i)
    GROUP BY 1
  ), t AS (
    SELECT assigned_user_id AS uid, count(*) n FROM message_threads
    WHERE organization_id = p_organization_id AND merged_into_thread_id IS NULL
      AND status NOT IN ('resolved','closed') AND assigned_user_id IN (SELECT i.user_id FROM inactive i)
    GROUP BY 1
  ), o AS (
    SELECT owner_user_id AS uid, count(*) n FROM opportunities
    WHERE organization_id = p_organization_id AND deleted_at IS NULL AND status = 'open'
      AND owner_user_id IN (SELECT i.user_id FROM inactive i)
    GROUP BY 1
  )
  SELECT i.user_id, coalesce(c.n, 0), coalesce(t.n, 0), coalesce(o.n, 0)
  FROM inactive i
  LEFT JOIN c ON c.uid = i.user_id
  LEFT JOIN t ON t.uid = i.user_id
  LEFT JOIN o ON o.uid = i.user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_inactive_members_portfolio_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_inactive_members_portfolio_v1(uuid) TO authenticated;
