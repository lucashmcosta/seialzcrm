CREATE OR REPLACE FUNCTION public.fn_permissions_from_legacy(l jsonb, privacy_on boolean, telephony_v2_on boolean)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  vt text; flag boolean;
  ma boolean := COALESCE((l->>'manage_assignments')::boolean,false);
  ms boolean := COALESCE((l->>'can_manage_settings')::boolean,false);
BEGIN
  vt := CASE WHEN COALESCE((l->>'view_all_threads')::boolean,false) OR NOT privacy_on THEN 'todos' ELSE 'meus' END;
  flag := vt = 'todos' OR COALESCE((l->>'can_manage_cs_queue')::boolean,false);
  RETURN jsonb_build_object(
    'dados', jsonb_build_object(
      'contatos', public.fn__rec_from_legacy(l, 'contacts', privacy_on),
      'oportunidades', public.fn__rec_from_legacy(l, 'opportunities', privacy_on),
      'conversas_comerciais', jsonb_build_object('ver',vt,'editar',vt,'excluir',vt,
          'atribuir', CASE WHEN ma THEN vt ELSE 'nenhum' END, 'sem_responsavel', flag),
      'atendimentos', jsonb_build_object('ver',vt,'editar',vt,
          'excluir', CASE WHEN COALESCE((l->>'can_close_threads')::boolean,false) THEN vt ELSE 'nenhum' END,
          'atribuir', CASE WHEN COALESCE((l->>'can_takeover_thread')::boolean,false) OR COALESCE((l->>'can_escalate_thread')::boolean,false) THEN vt ELSE 'nenhum' END,
          'sem_responsavel', flag),
      'chamadas', jsonb_build_object('ver', CASE WHEN COALESCE((l->>'can_view_all_calls')::boolean,false) OR NOT telephony_v2_on THEN 'todos' ELSE 'meus' END, 'exportar','nenhum'),
      'tarefas', jsonb_build_object('ver','todos','criar',true,'editar','todos','excluir','todos','atribuir','todos')),
    'ferramentas', jsonb_build_object(
      'tel_realizar', COALESCE((l->>'can_make_calls')::boolean,false),
      'tel_receber', COALESCE((l->>'can_receive_calls')::boolean,false),
      'tel_transferir', COALESCE((l->>'can_transfer_calls')::boolean,false),
      'rodizio', COALESCE((l->>'round_robin_recipient')::boolean,false),
      'wa_enviar', true,
      'wa_ativa', COALESCE((l->>'can_send_templates')::boolean,false),
      'importar', ms, 'marketing', ms, 'relatorios', ms, 'ia', true),
    'administracao', jsonb_build_object(
      'usuarios', COALESCE((l->>'can_manage_users')::boolean,false),
      'config', ms, 'distribuicao', ma,
      'config_atendimento', COALESCE((l->>'can_manage_support_settings')::boolean,false),
      'integracoes', COALESCE((l->>'can_manage_integrations')::boolean,false),
      'telefonia', COALESCE((l->>'can_manage_telephony')::boolean,false),
      'cobranca', COALESCE((l->>'can_manage_billing')::boolean,false),
      'auditoria', false));
END $function$;

CREATE OR REPLACE FUNCTION public.rbac_ctx()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'me', public.current_user_id(),
    'orgs', COALESCE((SELECT jsonb_object_agg(uo.organization_id::text,
        CASE WHEN p.is_system THEN public.rbac_full_perms()
             ELSE COALESCE(p.permissions_v2, public.fn_permissions_from_legacy(COALESCE(p.permissions,'{}'), COALESCE(o.private_records_enabled,false), public.telephony_v2_enabled_for_org(o.id))) END)
      FROM user_organizations uo
      JOIN permission_profiles p ON p.id = uo.permission_profile_id
      JOIN organizations o ON o.id = uo.organization_id
      WHERE uo.user_id = public.current_user_id() AND uo.is_active), '{}'::jsonb),
    'team', COALESCE((SELECT jsonb_object_agg(org::text, ids) FROM (
        SELECT tm.organization_id org, jsonb_agg(DISTINCT tm2.user_id) ids
        FROM team_members tm JOIN team_members tm2 ON tm2.team_id = tm.team_id
        WHERE tm.user_id = public.current_user_id() GROUP BY tm.organization_id) t), '{}'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.rbac_v2_backfill(_org uuid DEFAULT NULL::uuid, _recompute boolean DEFAULT false)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT (current_user NOT IN ('authenticated','anon') OR public.is_admin_user()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('rbac_v2.backfill','on', true);
  UPDATE permission_profiles p
     SET permissions_v2 = public.fn_permissions_from_legacy(COALESCE(p.permissions,'{}'), COALESCE(o.private_records_enabled,false), public.telephony_v2_enabled_for_org(o.id))
    FROM organizations o
   WHERE o.id = p.organization_id
     AND (_org IS NULL OR p.organization_id = _org)
     AND (_recompute OR p.permissions_v2 IS NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('rbac_v2.backfill','off', true);
  RETURN n;
END $function$;

DROP FUNCTION public.fn_permissions_from_legacy(jsonb, boolean);
REVOKE EXECUTE ON FUNCTION public.fn_permissions_from_legacy(jsonb, boolean, boolean) FROM anon;