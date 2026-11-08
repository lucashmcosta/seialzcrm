-- Início (get_home_dashboard_stats): "ver todas as oportunidades" passa a vir da MESMA
-- fonte do frontend (RBAC v2: my_perms_v2 → dados.oportunidades.ver = 'todos'; perfil de
-- sistema = tudo). Antes lia só a chave legada permission_profiles.permissions
-- ->> 'view_all_opportunities', que não existe em perfis antigos (ex.: Admin da Auxilius,
-- permissions_v2 nulo) — o admin via só as oportunidades em que era responsável.
-- Com o RBAC v2 desligado, mantém a leitura legada. Assinatura e retorno inalterados.
CREATE OR REPLACE FUNCTION public.get_home_dashboard_stats(p_organization_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_from_day date, p_to_day date, p_owner_user_id uuid DEFAULT NULL::uuid, p_tz text DEFAULT 'America/Sao_Paulo'::text, p_prev_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_prev_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_prev_from_day date DEFAULT NULL::date, p_prev_to_day date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  uuid;
  v_is_admin boolean;
  v_result   json;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = v_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  IF public.rbac_v2_enabled(p_organization_id) THEN
    -- Mesmo cálculo do usePermissions (toLegacy: view_all_opportunities = ver === 'todos').
    v_is_admin := COALESCE(public.my_perms_v2(p_organization_id) #>> '{dados,oportunidades,ver}' = 'todos', false);
  ELSE
    SELECT COALESCE((pp.permissions ->> 'view_all_opportunities')::boolean, false)
    INTO v_is_admin
    FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = v_user_id
      AND uo.organization_id = p_organization_id
      AND uo.is_active = true
    LIMIT 1;
  END IF;

  v_is_admin := COALESCE(v_is_admin, false);

  SELECT public.get_home_dashboard_stats_core(
           p_organization_id,
           p_from,
           p_to,
           p_from_day,
           p_to_day,
           CASE WHEN v_is_admin THEN p_owner_user_id ELSE NULL END,
           v_is_admin,
           v_user_id,
           COALESCE(NULLIF(p_tz, ''), 'America/Sao_Paulo'),
           p_prev_from,
           p_prev_to,
           p_prev_from_day,
           p_prev_to_day
         )
  INTO v_result;

  RETURN v_result;
END;
$function$;
