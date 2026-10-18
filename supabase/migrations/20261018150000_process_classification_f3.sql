-- Classificação de processos — Fase 3: correção pelo gestor, configurações do widget e exigência para ganhar.
-- Spec: docs/classificacao-v1/SPEC.md §5.1, §6. Rollback: supabase/rollback/20261018150000_process_classification_f3_DOWN.sql
--
-- Exigência para ganhar = MESMO mecanismo dos documentos (decisão do Lucas, 18/10): a regra mora na política de
-- fechamento (opportunity_close_policies.require_process_classification, fonte única), vira um item do avaliador
-- e segue o modo da política: 'monitor' só avisa, 'enforce' bloqueia (RPC + trigger existente
-- fn_guard_opportunity_won_requirements_v1), com o mesmo "forçar ganho" do admin. Sem trava própria.
-- O item só aparece com: exigência marcada E widget ligado E calibração publicada (sem calibração não há como
-- classificar, então não faz sentido cobrar). Orgs sem o módulo: avaliador idêntico ao de antes.

-- ===== Configurações do widget =====
ALTER TABLE public.opportunity_close_policies
  ADD COLUMN require_process_classification boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pc_required_for_won(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT require_process_classification FROM public.opportunity_close_policies WHERE organization_id = _org), false)
     AND public.org_widget_enabled(_org, 'process_classification')
     AND EXISTS (SELECT 1 FROM public.classification_calibration_versions WHERE organization_id = _org AND status = 'published')
$$;
REVOKE EXECUTE ON FUNCTION public.pc_required_for_won(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_required_for_won(uuid) TO authenticated, service_role;

-- Quem gerencia Configurações (mesma regra de ligar/desligar widgets) pode ler e alterar as configurações gerais.
DROP POLICY pcs_select ON public.process_classification_settings;
CREATE POLICY pcs_select ON public.process_classification_settings FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids()) AND (
    public.user_has_org_permission(organization_id, 'can_manage_settings')
    OR public.pc_has_flag(organization_id, '{administracao,calibrar_classificacao}')));

CREATE OR REPLACE FUNCTION public.pc_update_settings(_org uuid, _daily_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.process_classification_settings;
BEGIN
  IF NOT (_org = ANY(public.current_user_org_ids()) AND public.user_has_org_permission(_org, 'can_manage_settings')) THEN
    RAISE EXCEPTION 'pc:forbidden' USING ERRCODE = '42501';
  END IF;
  IF _daily_limit IS NOT NULL AND _daily_limit < 1 THEN RAISE EXCEPTION 'pc:invalid_limit'; END IF;
  INSERT INTO public.process_classification_settings(organization_id, daily_limit_per_seller, updated_at)
  VALUES (_org, _daily_limit, now())
  ON CONFLICT (organization_id) DO UPDATE SET daily_limit_per_seller = EXCLUDED.daily_limit_per_seller, updated_at = now()
  RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;
REVOKE EXECUTE ON FUNCTION public.pc_update_settings(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_update_settings(uuid, integer) TO authenticated;

-- ===== Exigência no avaliador de fechamento (mesmo padrão dos documentos) =====
-- Mesmo método das migrações do RBAC v2: lê a definição atual, injeta o item e confere que entrou.
-- can_close continua a fórmula da política (mode <> 'enforce' or nada faltando).
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.evaluate_opportunity_close_internal_v1(uuid,uuid)'::regprocedure);
  n := replace(d, $a$  return jsonb_build_object('organization_id',_organization_id,'opportunity_id',v_op.id,$a$,
$b$  -- Classificação de processos (requisito da política, como os documentos).
  if public.pc_required_for_won(_organization_id) then
    v_ok := exists(select 1 from public.process_classifications where opportunity_id = v_op.id and status = 'active');
    v_items := v_items || jsonb_build_array(jsonb_build_object('code','process_classification','label','Classificação do processo',
      'status', case when v_ok then 'passed' else 'missing' end, 'action','classify'));
    if not v_ok then v_missing := array_append(v_missing, 'process_classification'); end if;
  end if;

  return jsonb_build_object('organization_id',_organization_id,'opportunity_id',v_op.id,$b$);
  IF position('pc_required_for_won(_organization_id)' in n) = 0 THEN
    RAISE EXCEPTION 'F3: evaluate_opportunity_close_internal_v1 trecho não encontrado';
  END IF;
  EXECUTE n;
END $$;

-- Central Trabalhista: a SPEC pede a exigência ligada. Segue o modo da política da org (monitor avisa, enforce bloqueia).
UPDATE public.opportunity_close_policies p SET require_process_classification = true
  FROM public.organizations o WHERE o.id = p.organization_id AND o.name = 'Central Trabalhista';

-- ===== Pedido de correção (§6) — só service_role (edge process-classification) =====
-- Avisa quem pode liberar: perfis com ferramentas.liberar_correcao e o Admin (perfil de sistema).
CREATE OR REPLACE FUNCTION public.pc_request_correction(_org uuid, _opp uuid, _seller uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_cls uuid; v_id uuid; v_created timestamptz; v_notified integer;
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = _opp AND organization_id = _org FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'pc:opportunity_not_found'; END IF;
  IF o.status::text <> 'open' THEN RAISE EXCEPTION 'pc:opportunity_closed'; END IF;
  SELECT id INTO v_cls FROM public.process_classifications WHERE opportunity_id = _opp AND status = 'active';
  IF v_cls IS NULL THEN RAISE EXCEPTION 'pc:not_classified'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.process_classifications WHERE id = v_cls AND seller_user_id = _seller) THEN
    RAISE EXCEPTION 'pc:not_owner';
  END IF;
  IF EXISTS (SELECT 1 FROM public.classification_correction_requests
             WHERE classification_id = v_cls AND (status = 'pending' OR (status = 'released' AND replacement_id IS NULL))) THEN
    RAISE EXCEPTION 'pc:request_open';
  END IF;
  INSERT INTO public.classification_correction_requests(organization_id, classification_id, seller_user_id)
  VALUES (_org, v_cls, _seller) RETURNING id, created_at INTO v_id, v_created;

  INSERT INTO public.notifications(organization_id, user_id, type, title, body, entity_type, entity_id)
  SELECT _org, uo.user_id, 'classification_correction_requested', 'Pedido de correção de classificação',
         COALESCE((SELECT full_name FROM public.users WHERE id = _seller), 'Um vendedor') || ' pediu para corrigir a classificação da oportunidade "' || COALESCE(o.title, '') || '".',
         'opportunity', _opp
    FROM public.user_organizations uo
   WHERE uo.organization_id = _org AND uo.is_active AND uo.user_id <> _seller
     AND COALESCE((public.perms_v2_for_user(_org, uo.user_id) #>> '{ferramentas,liberar_correcao}')::boolean, false);
  GET DIAGNOSTICS v_notified = ROW_COUNT;
  RETURN jsonb_build_object('id', v_id, 'criadoEm', v_created, 'notificados', v_notified);
END $$;
REVOKE ALL ON FUNCTION public.pc_request_correction(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_request_correction(uuid, uuid, uuid) TO service_role;

-- Liberar ou recusar (o servidor confere a permissão antes). Liberar: a atual continua valendo até a nova ser
-- finalizada (pc_record_classification consome a liberação). Recusar: motivo obrigatório; o vendedor é avisado.
CREATE OR REPLACE FUNCTION public.pc_decide_correction(_org uuid, _opp uuid, _manager uuid, _release boolean, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; rq record;
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = _opp AND organization_id = _org FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'pc:opportunity_not_found'; END IF;
  IF o.status::text <> 'open' THEN RAISE EXCEPTION 'pc:opportunity_closed'; END IF;
  SELECT r.* INTO rq FROM public.classification_correction_requests r
    JOIN public.process_classifications c ON c.id = r.classification_id
   WHERE c.opportunity_id = _opp AND c.status = 'active' AND r.status = 'pending' FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'pc:no_pending_request'; END IF;
  IF rq.seller_user_id = _manager THEN RAISE EXCEPTION 'pc:own_request'; END IF;
  IF NOT _release AND length(btrim(COALESCE(_reason, ''))) = 0 THEN RAISE EXCEPTION 'pc:reason_required'; END IF;

  UPDATE public.classification_correction_requests
     SET status = CASE WHEN _release THEN 'released' ELSE 'refused' END,
         decided_by = _manager, decided_at = now(), reason = NULLIF(btrim(COALESCE(_reason, '')), '')
   WHERE id = rq.id;
  INSERT INTO public.notifications(organization_id, user_id, type, title, body, entity_type, entity_id)
  VALUES (_org, rq.seller_user_id,
          CASE WHEN _release THEN 'classification_correction_released' ELSE 'classification_correction_refused' END,
          CASE WHEN _release THEN 'Correção liberada' ELSE 'Correção recusada' END,
          CASE WHEN _release THEN 'Você já pode refazer a classificação da oportunidade "' || COALESCE(o.title, '') || '".'
               ELSE 'Motivo: ' || btrim(_reason) END,
          'opportunity', _opp);
  RETURN jsonb_build_object('status', CASE WHEN _release THEN 'released' ELSE 'refused' END);
END $$;
REVOKE ALL ON FUNCTION public.pc_decide_correction(uuid, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_decide_correction(uuid, uuid, uuid, boolean, text) TO service_role;
