CREATE OR REPLACE FUNCTION public.fn__rec_from_legacy(l jsonb, kind text, privacy_on boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE va boolean := COALESCE((l->>('view_all_'||kind))::boolean,false);
  ed boolean := COALESCE((l->>('can_edit_'||kind))::boolean,false);
  dl boolean := COALESCE((l->>('can_delete_'||kind))::boolean,false);
  ma boolean := COALESCE((l->>'manage_assignments')::boolean,false);
  ver text; editar text;
BEGIN
  ver := CASE WHEN va OR NOT privacy_on THEN 'todos' ELSE 'meus' END;
  editar := CASE WHEN ed THEN ver ELSE 'nenhum' END;
  RETURN jsonb_build_object('ver',ver,'criar',ed,'editar',editar,
    'excluir', CASE WHEN dl AND ed THEN editar ELSE 'nenhum' END,
    'exportar','nenhum',
    'atribuir', CASE WHEN ma THEN ver ELSE 'nenhum' END,
    'sem_responsavel', ver = 'todos' OR ma);
END $$;

DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.fn_permissions_from_legacy(jsonb,boolean)'::regprocedure);
  d := replace(replace(d, E'  FUNCTION_DUMMY int;\n', ''), E'  t boolean; vt text;', '  vt text;');
  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public.fn_permissions_to_legacy(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'can_view_contacts', p#>>'{dados,contatos,ver}' <> 'nenhum',
    'view_all_contacts', p#>>'{dados,contatos,ver}' = 'todos',
    'can_edit_contacts', p#>>'{dados,contatos,editar}' <> 'nenhum',
    'can_delete_contacts', p#>>'{dados,contatos,excluir}' <> 'nenhum',
    'can_view_opportunities', p#>>'{dados,oportunidades,ver}' <> 'nenhum',
    'view_all_opportunities', p#>>'{dados,oportunidades,ver}' = 'todos',
    'can_edit_opportunities', p#>>'{dados,oportunidades,editar}' <> 'nenhum',
    'can_delete_opportunities', p#>>'{dados,oportunidades,excluir}' <> 'nenhum',
    'view_all_threads', p#>>'{dados,conversas_comerciais,ver}' = 'todos' AND p#>>'{dados,atendimentos,ver}' = 'todos',
    'can_manage_cs_queue', COALESCE((p#>>'{dados,atendimentos,sem_responsavel}')::boolean,false),
    'can_takeover_thread', p#>>'{dados,atendimentos,atribuir}' <> 'nenhum',
    'can_escalate_thread', p#>>'{dados,atendimentos,atribuir}' <> 'nenhum',
    'can_close_threads', p#>>'{dados,atendimentos,excluir}' <> 'nenhum',
    'can_view_all_calls', p#>>'{dados,chamadas,ver}' = 'todos',
    'manage_assignments', COALESCE((p#>>'{administracao,distribuicao}')::boolean,false),
    'round_robin_recipient', COALESCE((p#>>'{ferramentas,rodizio}')::boolean,false),
    'can_make_calls', COALESCE((p#>>'{ferramentas,tel_realizar}')::boolean,false),
    'can_receive_calls', COALESCE((p#>>'{ferramentas,tel_receber}')::boolean,false),
    'can_transfer_calls', COALESCE((p#>>'{ferramentas,tel_transferir}')::boolean,false),
    'can_send_templates', COALESCE((p#>>'{ferramentas,wa_ativa}')::boolean,false),
    'can_manage_users', COALESCE((p#>>'{administracao,usuarios}')::boolean,false),
    'can_manage_settings', COALESCE((p#>>'{administracao,config}')::boolean,false),
    'can_manage_integrations', COALESCE((p#>>'{administracao,integracoes}')::boolean,false),
    'can_manage_telephony', COALESCE((p#>>'{administracao,telefonia}')::boolean,false),
    'can_manage_billing', COALESCE((p#>>'{administracao,cobranca}')::boolean,false),
    'can_manage_support_settings', COALESCE((p#>>'{administracao,config_atendimento}')::boolean,false))
$$;

-- Saving permissions_v2 from the UI rewrites legacy keys; backfill skips via GUC.
CREATE OR REPLACE FUNCTION public.fn_permissions_v2_sync_legacy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('rbac_v2.backfill', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.permissions_v2 IS NOT NULL AND NEW.permissions_v2 IS DISTINCT FROM OLD.permissions_v2 THEN
    NEW.permissions := COALESCE(NEW.permissions,'{}'::jsonb) || public.fn_permissions_to_legacy(NEW.permissions_v2);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_permissions_v2_to_legacy BEFORE INSERT OR UPDATE OF permissions_v2 ON public.permission_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_permissions_v2_sync_legacy();

CREATE OR REPLACE FUNCTION public.rbac_v2_backfill(_org uuid DEFAULT NULL, _recompute boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT (current_user NOT IN ('authenticated','anon') OR public.is_admin_user()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('rbac_v2.backfill','on', true);
  UPDATE permission_profiles p
     SET permissions_v2 = public.fn_permissions_from_legacy(COALESCE(p.permissions,'{}'), COALESCE(o.private_records_enabled,false))
    FROM organizations o
   WHERE o.id = p.organization_id
     AND (_org IS NULL OR p.organization_id = _org)
     AND (_recompute OR p.permissions_v2 IS NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('rbac_v2.backfill','off', true);
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.rbac_v2_backfill(uuid,boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.fn_permissions_from_legacy(jsonb,boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.fn_permissions_to_legacy(jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.fn__rec_from_legacy(jsonb,text,boolean) FROM public, anon;