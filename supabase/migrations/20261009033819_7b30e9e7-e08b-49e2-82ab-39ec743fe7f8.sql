-- ===== Resolver =====
CREATE OR REPLACE FUNCTION public.rbac_v2_global_on() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT COALESCE((SELECT is_enabled FROM feature_flags WHERE name='rbac_v2' LIMIT 1), false) $$;
CREATE OR REPLACE FUNCTION public.rbac_v2_org_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT COALESCE((SELECT organization_ids FROM feature_flags WHERE name='rbac_v2' LIMIT 1), '{}'::uuid[]) $$;
CREATE OR REPLACE FUNCTION public.rbac_v2_on(_org uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS
$$ SELECT public.rbac_v2_global_on() OR _org = ANY(public.rbac_v2_org_ids()) $$;

CREATE OR REPLACE FUNCTION public.rbac_full_perms() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('dados', jsonb_build_object(
    'contatos', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","exportar":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'oportunidades', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","exportar":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'conversas_comerciais', '{"ver":"todos","editar":"todos","excluir":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'atendimentos', '{"ver":"todos","editar":"todos","excluir":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'chamadas', '{"ver":"todos","exportar":"todos"}'::jsonb,
    'tarefas', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","atribuir":"todos"}'::jsonb),
   'ferramentas', '{"tel_realizar":true,"tel_receber":true,"tel_transferir":true,"rodizio":true,"wa_enviar":true,"wa_ativa":true,"importar":true,"marketing":true,"relatorios":true,"ia":true}'::jsonb,
   'administracao', '{"usuarios":true,"config":true,"distribuicao":true,"config_atendimento":true,"integracoes":true,"telefonia":true,"cobranca":true,"auditoria":true}'::jsonb)
$$;

-- Contexto do usuário atual (todas as orgs ativas): perms por org + pessoas das equipes.
CREATE OR REPLACE FUNCTION public.rbac_ctx() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'me', public.current_user_id(),
    'orgs', COALESCE((SELECT jsonb_object_agg(uo.organization_id::text,
        CASE WHEN p.is_system THEN public.rbac_full_perms()
             ELSE COALESCE(p.permissions_v2, public.fn_permissions_from_legacy(COALESCE(p.permissions,'{}'), COALESCE(o.private_records_enabled,false))) END)
      FROM user_organizations uo
      JOIN permission_profiles p ON p.id = uo.permission_profile_id
      JOIN organizations o ON o.id = uo.organization_id
      WHERE uo.user_id = public.current_user_id() AND uo.is_active), '{}'::jsonb),
    'team', COALESCE((SELECT jsonb_object_agg(org::text, ids) FROM (
        SELECT tm.organization_id org, jsonb_agg(DISTINCT tm2.user_id) ids
        FROM team_members tm JOIN team_members tm2 ON tm2.team_id = tm.team_id
        WHERE tm.user_id = public.current_user_id() GROUP BY tm.organization_id) t), '{}'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.rbac_check(ctx jsonb, _org uuid, _obj text, _acao text, _resp uuid[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE sc text := ctx #>> ARRAY['orgs',_org::text,'dados',_obj,_acao];
  ver text := ctx #>> ARRAY['orgs',_org::text,'dados',_obj,'ver'];
  r uuid[] := array_remove(COALESCE(_resp,'{}'), NULL);
  me uuid := (ctx->>'me')::uuid;
BEGIN
  IF sc IS NULL OR sc = 'nenhum' THEN RETURN false; END IF;
  IF sc = 'todos' THEN RETURN true; END IF;
  IF cardinality(r) = 0 THEN
    RETURN COALESCE((ctx #>> ARRAY['orgs',_org::text,'dados',_obj,'sem_responsavel'])::boolean, false) OR ver = 'todos';
  END IF;
  IF me = ANY(r) THEN RETURN true; END IF;
  IF sc = 'equipe' THEN
    RETURN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(ctx #> ARRAY['team',_org::text],'[]')) t(id) WHERE t.id::uuid = ANY(r));
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.rbac_flag(ctx jsonb, _org uuid, _path text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS
$$ SELECT COALESCE((ctx #>> (ARRAY['orgs',_org::text] || _path))::boolean, false) $$;

CREATE OR REPLACE FUNCTION public.rbac_thread_obj(_bc text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN _bc = 'customer_service' THEN 'atendimentos' ELSE 'conversas_comerciais' END $$;

-- Nomes do documento
CREATE OR REPLACE FUNCTION public.my_perms_v2(_org uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT public.rbac_ctx() #> ARRAY['orgs',_org::text] $$;
CREATE OR REPLACE FUNCTION public.my_team_user_ids(_org uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT array_append(COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(public.rbac_ctx() #> ARRAY['team',_org::text]) x), '{}'), public.current_user_id()) $$;
CREATE OR REPLACE FUNCTION public.can_on_record(_org uuid, _obj text, _acao text, _resp uuid[]) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS
$$ SELECT public.rbac_check(public.rbac_ctx(), _org, _obj, _acao, _resp) $$;

REVOKE EXECUTE ON FUNCTION public.rbac_v2_global_on(), public.rbac_v2_org_ids(), public.rbac_ctx(), public.my_perms_v2(uuid), public.my_team_user_ids(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rbac_v2_global_on(), public.rbac_v2_org_ids(), public.rbac_ctx(), public.my_perms_v2(uuid), public.my_team_user_ids(uuid) TO authenticated, service_role;

-- ===== Backup das policies que serão envolvidas =====
CREATE TABLE IF NOT EXISTS public._rbac_v2_policy_backup (tablename text, policyname text, qual text, with_check text, PRIMARY KEY (tablename, policyname));
ALTER TABLE public._rbac_v2_policy_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._rbac_v2_policy_backup FROM anon, authenticated;
GRANT ALL ON public._rbac_v2_policy_backup TO service_role;

-- ===== Envolver policies: CASE WHEN ligado THEN nova ELSE (atual) END =====
DO $$
DECLARE
  ON_ text := '((SELECT public.rbac_v2_global_on()) OR organization_id = ANY((SELECT public.rbac_v2_org_ids())::uuid[]))';
  CTX text := '(SELECT public.rbac_ctx())';
  MEM text := '(organization_id = ANY ((SELECT public.current_user_org_ids())::uuid[]))';
  ME text := '(SELECT public.current_user_id())';
  spec record; old_q text; old_c text; s text;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('contacts','Users can view contacts in my org placeholder',NULL,NULL)) v(t,p,nu,nc) WHERE false LOOP NULL; END LOOP;

  CREATE TEMP TABLE _spec(t text, p text, nu text, nc text) ON COMMIT DROP;
  INSERT INTO _spec VALUES
   ('contacts','Users can view contacts in their org',
     format('(SELECT public.is_admin_user()) OR (%s AND deleted_at IS NULL AND public.rbac_check(%s, organization_id, ''contatos'', ''ver'', ARRAY[owner_user_id]))', MEM, CTX), NULL),
   ('contacts','Users can insert contacts in their org', NULL,
     format('%s AND public.rbac_flag(%s, organization_id, ARRAY[''dados'',''contatos'',''criar'']) AND (owner_user_id IS NULL OR owner_user_id = %s OR public.rbac_check(%s, organization_id, ''contatos'', ''atribuir'', ARRAY[owner_user_id]))', MEM, CTX, ME, CTX)),
   ('contacts','Users can update contacts in their org',
     format('%s AND public.rbac_check(%s, organization_id, ''contatos'', ''editar'', ARRAY[owner_user_id])', MEM, CTX), NULL),
   ('contacts','Trash: deleters view deleted contacts',
     format('deleted_at IS NOT NULL AND %s AND public.rbac_check(%s, organization_id, ''contatos'', ''excluir'', ARRAY[owner_user_id])', MEM, CTX), NULL),
   ('opportunities','Users can view opportunities in their org',
     format('public.is_admin_user() OR (%s AND deleted_at IS NULL AND public.rbac_check(%s, organization_id, ''oportunidades'', ''ver'', ARRAY[owner_user_id]))', MEM, CTX), NULL),
   ('opportunities','Users can insert opportunities in their org', NULL,
     format('%s AND public.rbac_flag(%s, organization_id, ARRAY[''dados'',''oportunidades'',''criar'']) AND (owner_user_id IS NULL OR owner_user_id = %s OR public.rbac_check(%s, organization_id, ''oportunidades'', ''atribuir'', ARRAY[owner_user_id]))', MEM, CTX, ME, CTX)),
   ('opportunities','Users can update opportunities in their org',
     format('%s AND public.rbac_check(%s, organization_id, ''oportunidades'', ''editar'', ARRAY[owner_user_id])', MEM, CTX), NULL),
   ('opportunities','Trash: deleters view deleted opportunities',
     format('deleted_at IS NOT NULL AND %s AND public.rbac_check(%s, organization_id, ''oportunidades'', ''excluir'', ARRAY[owner_user_id])', MEM, CTX), NULL),
   ('message_threads','Users can view threads in their org',
     format('public.is_admin_user() OR (%s AND public.rbac_check(%s, organization_id, public.rbac_thread_obj(business_context), ''ver'', ARRAY[assigned_user_id]))', MEM, CTX), NULL),
   ('message_threads','message_threads_update',
     format('%s AND public.rbac_check(%s, organization_id, public.rbac_thread_obj(business_context), ''ver'', ARRAY[assigned_user_id])', MEM, CTX),
     MEM),
   ('messages','messages_select',
     format('%s AND EXISTS (SELECT 1 FROM public.message_threads t WHERE t.id = messages.thread_id)', MEM), NULL),
   ('messages','messages_insert', NULL,
     format('%s AND public.rbac_flag(%s, organization_id, ARRAY[''ferramentas'',''wa_enviar'']) AND EXISTS (SELECT 1 FROM public.message_threads t WHERE t.id = messages.thread_id AND public.rbac_check(%s, t.organization_id, public.rbac_thread_obj(t.business_context), ''editar'', ARRAY[t.assigned_user_id]))', MEM, CTX, CTX)),
   ('calls','Users can view permitted calls',
     format('user_has_org_access(organization_id) AND public.rbac_check(%s, organization_id, ''chamadas'', ''ver'', ARRAY[user_id, initiated_by_user_id, answered_by_user_id, current_agent_user_id])', CTX), NULL),
   ('tasks','Users can view tasks in their org',
     format('%s AND deleted_at IS NULL AND public.rbac_check(%s, organization_id, ''tarefas'', ''ver'', ARRAY[assigned_user_id])', MEM, CTX), NULL),
   ('tasks','Users can view deleted tasks in trash',
     format('%s AND deleted_at IS NOT NULL AND public.rbac_check(%s, organization_id, ''tarefas'', ''excluir'', ARRAY[assigned_user_id])', MEM, CTX), NULL),
   ('tasks','Users can manage tasks in their org',
     format('%s AND public.rbac_check(%s, organization_id, ''tarefas'', ''editar'', ARRAY[assigned_user_id])', MEM, CTX),
     format('%s AND (assigned_user_id IS NULL OR assigned_user_id = %s OR public.rbac_check(%s, organization_id, ''tarefas'', ''atribuir'', ARRAY[assigned_user_id]))', MEM, ME, CTX)),
   ('activities','Users can view activities in their org',
     '(user_has_org_access(organization_id) AND deleted_at IS NULL) AND (contact_id IS NULL OR EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = activities.contact_id)) AND (opportunity_id IS NULL OR EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = activities.opportunity_id))', NULL),
   ('contact_identity_profiles','identity_profiles_select',
     format('%s AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_identity_profiles.contact_id)', MEM), NULL),
   ('documents','Users can manage attachments in their org',
     'user_has_org_access(organization_id) AND (entity_type IS DISTINCT FROM ''contact'' OR EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = documents.entity_id)) AND (entity_type IS DISTINCT FROM ''opportunity'' OR EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = documents.entity_id))', NULL);

  FOR spec IN SELECT * FROM _spec LOOP
    SELECT qual, with_check INTO old_q, old_c FROM pg_policies WHERE schemaname='public' AND tablename=spec.t AND policyname=spec.p;
    IF NOT FOUND THEN RAISE EXCEPTION 'B4: policy % em % não encontrada', spec.p, spec.t; END IF;
    INSERT INTO public._rbac_v2_policy_backup VALUES (spec.t, spec.p, old_q, old_c) ON CONFLICT DO NOTHING;
    s := format('ALTER POLICY %I ON public.%I', spec.p, spec.t);
    IF old_q IS NOT NULL THEN
      s := s || format(' USING (CASE WHEN %s THEN (%s) ELSE (%s) END)', ON_, COALESCE(spec.nu, old_q), old_q);
    END IF;
    IF old_c IS NOT NULL OR spec.nc IS NOT NULL THEN
      s := s || format(' WITH CHECK (CASE WHEN %s THEN (%s) ELSE (%s) END)', ON_, COALESCE(spec.nc, old_c, old_q), COALESCE(old_c, old_q, 'true'));
    END IF;
    EXECUTE s;
  END LOOP;
END $$;

-- ===== Travas de ação (só com o interruptor ligado; service_role e funções internas livres) =====
CREATE OR REPLACE FUNCTION public.fn_rbac_v2_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r record := COALESCE(NEW, OLD); ctx jsonb; obj text; oobj text; old_resp uuid; new_resp uuid;
BEGIN
  IF current_user NOT IN ('authenticated','anon') OR NOT public.rbac_v2_on(r.organization_id) THEN RETURN COALESCE(NEW, OLD); END IF;
  ctx := public.rbac_ctx();
  IF TG_TABLE_NAME IN ('contacts','opportunities') THEN
    obj := CASE TG_TABLE_NAME WHEN 'contacts' THEN 'contatos' ELSE 'oportunidades' END;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id AND NOT (
           public.rbac_check(ctx, OLD.organization_id, obj, 'atribuir', ARRAY[OLD.owner_user_id])
           AND (NEW.owner_user_id IS NULL OR NEW.owner_user_id = (ctx->>'me')::uuid OR public.rbac_check(ctx, NEW.organization_id, obj, 'atribuir', ARRAY[NEW.owner_user_id]))) THEN
        RAISE EXCEPTION 'rbac_assign_denied' USING ERRCODE='42501';
      END IF;
      IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NOT public.rbac_check(ctx, OLD.organization_id, obj, 'excluir', ARRAY[OLD.owner_user_id]) THEN
        RAISE EXCEPTION 'rbac_delete_denied' USING ERRCODE='42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'tasks' THEN
    IF TG_OP = 'INSERT' AND NOT public.rbac_flag(ctx, NEW.organization_id, ARRAY['dados','tarefas','criar']) THEN
      RAISE EXCEPTION 'rbac_create_denied' USING ERRCODE='42501';
    ELSIF TG_OP = 'DELETE' AND NOT public.rbac_check(ctx, OLD.organization_id, 'tarefas', 'excluir', ARRAY[OLD.assigned_user_id]) THEN
      RAISE EXCEPTION 'rbac_delete_denied' USING ERRCODE='42501';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id AND NOT public.rbac_check(ctx, OLD.organization_id, 'tarefas', 'atribuir', ARRAY[OLD.assigned_user_id]) THEN
        RAISE EXCEPTION 'rbac_assign_denied' USING ERRCODE='42501';
      END IF;
      IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NOT public.rbac_check(ctx, OLD.organization_id, 'tarefas', 'excluir', ARRAY[OLD.assigned_user_id]) THEN
        RAISE EXCEPTION 'rbac_delete_denied' USING ERRCODE='42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'message_threads' AND TG_OP = 'UPDATE' THEN
    oobj := public.rbac_thread_obj(OLD.business_context);
    IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
       AND NOT (OLD.assigned_user_id IS NULL AND NEW.assigned_user_id = (ctx->>'me')::uuid AND public.rbac_check(ctx, OLD.organization_id, oobj, 'ver', ARRAY[]::uuid[]))
       AND NOT public.rbac_check(ctx, OLD.organization_id, oobj, 'atribuir', ARRAY[OLD.assigned_user_id]) THEN
      RAISE EXCEPTION 'rbac_assign_denied' USING ERRCODE='42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('resolved','closed')
       AND NOT public.rbac_check(ctx, OLD.organization_id, oobj, 'excluir', ARRAY[OLD.assigned_user_id]) THEN
      RAISE EXCEPTION 'rbac_close_denied' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_rbac_v2_guard BEFORE UPDATE OF owner_user_id, deleted_at ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.fn_rbac_v2_guard();
CREATE TRIGGER trg_rbac_v2_guard BEFORE UPDATE OF owner_user_id, deleted_at ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.fn_rbac_v2_guard();
CREATE TRIGGER trg_rbac_v2_guard BEFORE INSERT OR DELETE OR UPDATE OF assigned_user_id, deleted_at ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.fn_rbac_v2_guard();
CREATE TRIGGER trg_rbac_v2_guard BEFORE UPDATE OF assigned_user_id, status ON public.message_threads FOR EACH ROW EXECUTE FUNCTION public.fn_rbac_v2_guard();

-- A7 com interruptor ligado: a trava nova (excluir por escopo) substitui a checagem das chaves antigas
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.fn_guard_soft_delete()'::regprocedure);
  n := replace(d, E'BEGIN\n  IF current_user IN', E'BEGIN\n  IF public.rbac_v2_on(NEW.organization_id) THEN RETURN NEW; END IF;\n  IF current_user IN');
  IF n = d THEN RAISE EXCEPTION 'B4: fn_guard_soft_delete trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- rpc_list_message_threads: mesma regra nova quando ligado (assinatura única mantida)
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.rpc_list_message_threads(uuid,text,text[],uuid,boolean,timestamptz,uuid,integer,text,uuid[],uuid[])'::regprocedure);
  n := replace(d, E'  v_cs_flag boolean;\n', E'  v_cs_flag boolean;\n  v_rbac boolean;\n  v_ctx jsonb;\n');
  n := replace(n, E'  v_can_view_all_threads := user_can_view_all(p_organization_id, ''threads'');',
                  E'  v_rbac := public.rbac_v2_on(p_organization_id);\n  IF v_rbac THEN v_ctx := public.rbac_ctx(); END IF;\n  v_can_view_all_threads := user_can_view_all(p_organization_id, ''threads'');');
  n := replace(n, 'AND (v_can_view_all_contacts OR c.owner_user_id = v_user_id OR mt.assigned_user_id IS NULL)',
                  'AND (CASE WHEN v_rbac THEN (c.owner_user_id IS NULL OR public.rbac_check(v_ctx, p_organization_id, ''contatos'', ''ver'', ARRAY[c.owner_user_id])) ELSE (v_can_view_all_contacts OR c.owner_user_id = v_user_id OR mt.assigned_user_id IS NULL) END)');
  n := replace(n, 'AND (v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR (mt.assigned_user_id IS NULL AND user_has_cs_permission(p_organization_id, ''can_manage_cs_queue'')))',
                  'AND (CASE WHEN v_rbac THEN public.rbac_check(v_ctx, p_organization_id, public.rbac_thread_obj(mt.business_context), ''ver'', ARRAY[mt.assigned_user_id]) ELSE (v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR (mt.assigned_user_id IS NULL AND user_has_cs_permission(p_organization_id, ''can_manage_cs_queue''))) END)');
  IF (length(n) - length(d)) < 300 OR position('v_rbac THEN public.rbac_check(v_ctx, p_organization_id, public.rbac_thread_obj' in n) = 0
     OR position('v_rbac THEN (c.owner_user_id IS NULL' in n) = 0 OR position('v_ctx := public.rbac_ctx()' in n) = 0 THEN
    RAISE EXCEPTION 'B4: rpc_list_message_threads trechos não encontrados';
  END IF;
  EXECUTE n;
END $$;