-- Marcar como Perdida, reabrir e corrigir o motivo.
--
-- Toda perda feita por pessoa passa por mark_opportunity_lost_v1 (ou a versão em lote), que valida as regras e
-- grava a linha em opportunity_losses. O trigger trg_guard_opportunity_lost_v1 cobre os outros caminhos
-- (Kanban, lote, formulário, RPC de transição): se a org tem motivo ativo e motivo obrigatório, pessoa logada não
-- consegue perder sem a RPC; nos demais casos a perda é registrada sem motivo, para o histórico ficar completo.
-- Org sem motivo ativo cadastrado continua perdendo como antes.
--
-- A integração (Lucas) entra por fn_mark_opportunity_lost_internal_v1 (service_role) com actor_type
-- automation/agent/api e automation_ref, resolvendo o código do detalhe antes de chamar. Detalhe "só automação"
-- é aceito para qualquer actor_type diferente de 'user'.
-- Rollback: supabase/rollback/20261110120300_loss_rpcs_and_guard_DOWN.sql


-- Valida a escolha (motivo/detalhe/descrição) contra o cadastro e as regras gerais. Devolve o que gravar.
CREATE OR REPLACE FUNCTION public.fn_resolve_loss_choice_v1(
  _organization_id uuid,
  _reason_id uuid,
  _detail_id uuid,
  _description text,
  _for_person boolean
)
RETURNS TABLE (reason_id uuid, detail_id uuid, reason_code text, detail_code text, description text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason_required boolean;
  v_detail_mode text;
  v_reason public.opportunity_loss_reasons%rowtype;
  v_detail public.opportunity_loss_reason_details%rowtype;
  v_description text := nullif(btrim(coalesce(_description, '')), '');
BEGIN
  SELECT s.reason_required, s.detail_mode INTO v_reason_required, v_detail_mode
  FROM public.loss_settings_internal_v1(_organization_id) s;

  IF _detail_id IS NOT NULL THEN
    SELECT * INTO v_detail FROM public.opportunity_loss_reason_details d
    WHERE d.id = _detail_id AND d.organization_id = _organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'loss_detail_not_found' USING ERRCODE = 'P0002'; END IF;
    IF _reason_id IS NOT NULL AND _reason_id <> v_detail.reason_id THEN
      RAISE EXCEPTION 'loss_detail_reason_mismatch' USING ERRCODE = '22023';
    END IF;
    _reason_id := v_detail.reason_id;
  END IF;

  IF _reason_id IS NULL THEN
    IF v_reason_required AND EXISTS (
      SELECT 1 FROM public.opportunity_loss_reasons r
      WHERE r.organization_id = _organization_id AND r.is_active
    ) THEN
      RAISE EXCEPTION 'loss_reason_required' USING ERRCODE = '23514',
        HINT = 'Escolha o motivo da perda.';
    END IF;
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, v_description;
    RETURN;
  END IF;

  SELECT * INTO v_reason FROM public.opportunity_loss_reasons r
  WHERE r.id = _reason_id AND r.organization_id = _organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'loss_reason_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_reason.is_active THEN RAISE EXCEPTION 'loss_reason_inactive' USING ERRCODE = '23514'; END IF;

  IF _detail_id IS NOT NULL THEN
    -- "detalhe desligado" vale só para pessoas; automação e API continuam gravando o detalhe pelo código
    IF v_detail_mode = 'off' AND _for_person THEN
      RAISE EXCEPTION 'loss_detail_disabled' USING ERRCODE = '23514';
    END IF;
    IF NOT v_detail.is_active THEN RAISE EXCEPTION 'loss_detail_inactive' USING ERRCODE = '23514'; END IF;
    IF v_detail.automation_only AND _for_person THEN
      RAISE EXCEPTION 'loss_detail_automation_only' USING ERRCODE = '42501';
    END IF;
    IF v_detail.requires_description AND v_description IS NULL THEN
      RAISE EXCEPTION 'loss_description_required' USING ERRCODE = '23514',
        HINT = 'Este detalhe exige uma descrição.';
    END IF;
  ELSIF v_detail_mode = 'required' AND EXISTS (
    -- só cobra o detalhe se o motivo tiver algum que quem está marcando possa escolher
    SELECT 1 FROM public.opportunity_loss_reason_details d
    WHERE d.reason_id = _reason_id AND d.is_active AND (NOT d.automation_only OR NOT _for_person)
  ) THEN
    RAISE EXCEPTION 'loss_detail_required' USING ERRCODE = '23514', HINT = 'Escolha o detalhe da perda.';
  END IF;

  RETURN QUERY SELECT v_reason.id, v_detail.id, v_reason.code, v_detail.code, v_description;
END $$;

-- Núcleo: move para a etapa Perdida e grava a perda. Não checa permissão (quem chama checa).
CREATE OR REPLACE FUNCTION public.fn_mark_opportunity_lost_internal_v1(
  _organization_id uuid,
  _opportunity_id uuid,
  _reason_id uuid,
  _detail_id uuid,
  _description text,
  _close_date date,
  _actor_type text,
  _actor_user_id uuid,
  _automation_ref text,
  _source text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_op public.opportunities%rowtype;
  v_choice record;
  v_lost_stage uuid;
  v_loss_id uuid;
BEGIN
  SELECT * INTO v_op FROM public.opportunities
  WHERE id = _opportunity_id AND organization_id = _organization_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'opportunity_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_op.status::text = 'lost' THEN RAISE EXCEPTION 'opportunity_already_lost' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_choice FROM public.fn_resolve_loss_choice_v1(
    _organization_id, _reason_id, _detail_id, _description, _actor_type = 'user');

  SELECT id INTO v_lost_stage FROM public.pipeline_stages
  WHERE organization_id = _organization_id AND type = 'lost'
  ORDER BY order_index LIMIT 1;
  IF v_lost_stage IS NULL THEN RAISE EXCEPTION 'lost_stage_not_found' USING ERRCODE = 'P0002'; END IF;

  PERFORM set_config('app.opportunity_loss_recorded', _opportunity_id::text, true);
  UPDATE public.opportunities
  SET pipeline_stage_id = v_lost_stage,
      status = 'lost'::public.opportunity_status,
      close_date = coalesce(_close_date, current_date),
      updated_by = coalesce(_actor_user_id, updated_by)
  WHERE id = _opportunity_id;
  PERFORM set_config('app.opportunity_loss_recorded', '', true);

  INSERT INTO public.opportunity_losses (
    organization_id, opportunity_id, reason_id, detail_id, reason_code, detail_code, description,
    stage_id_at_loss, close_date, actor_type, actor_user_id, automation_ref, source
  ) VALUES (
    _organization_id, _opportunity_id, v_choice.reason_id, v_choice.detail_id, v_choice.reason_code,
    v_choice.detail_code, v_choice.description, v_op.pipeline_stage_id, coalesce(_close_date, current_date),
    _actor_type, _actor_user_id, nullif(btrim(coalesce(_automation_ref, '')), ''), coalesce(nullif(_source, ''), 'unknown')
  ) RETURNING id INTO v_loss_id;

  RETURN jsonb_build_object('ok', true, 'status', 'lost', 'loss_id', v_loss_id,
    'reason_code', v_choice.reason_code, 'detail_code', v_choice.detail_code);
END $$;

CREATE OR REPLACE FUNCTION public.mark_opportunity_lost_v1(
  _organization_id uuid,
  _opportunity_id uuid,
  _reason_id uuid,
  _detail_id uuid,
  _description text,
  _close_date date,
  _source text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.user_has_org_permission(_organization_id, 'can_edit_opportunities') THEN
    RAISE EXCEPTION 'forbidden_edit_opportunities' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_mark_opportunity_lost_internal_v1(
    _organization_id, _opportunity_id, _reason_id, _detail_id, _description, _close_date,
    CASE WHEN auth.role() = 'service_role' THEN 'system' ELSE 'user' END,
    public.current_user_id(), NULL, _source);
END $$;

-- Lote (até 100): mesma escolha para todas; tudo ou nada.
CREATE OR REPLACE FUNCTION public.mark_opportunities_lost_batch_v1(
  _organization_id uuid,
  _opportunity_ids uuid[],
  _reason_id uuid,
  _detail_id uuid,
  _description text,
  _close_date date,
  _source text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(cardinality(_opportunity_ids), 0) = 0 OR cardinality(_opportunity_ids) > 100 THEN
    RAISE EXCEPTION 'batch_size_must_be_between_1_and_100' USING ERRCODE = '22023';
  END IF;
  FOREACH v_id IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(_opportunity_ids) x) LOOP
    v_results := v_results || jsonb_build_array(public.mark_opportunity_lost_v1(
      _organization_id, v_id, _reason_id, _detail_id, _description, _close_date,
      coalesce(nullif(_source, ''), 'batch')));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'results', v_results);
END $$;

-- Reabrir: volta para a etapa em que estava ao perder (ou a primeira etapa aberta, se ela não existe mais).
-- Ganha reabre na primeira etapa aberta, como o botão fazia. A permissão de reabrir é do trg_guard_opportunity_reopen_v1;
-- o fechamento da perda em aberto é do trg_close_open_loss_on_reopen_v1.
CREATE OR REPLACE FUNCTION public.reopen_opportunity_v1(
  _organization_id uuid,
  _opportunity_id uuid,
  _source text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_op public.opportunities%rowtype;
  v_target uuid;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.user_has_org_permission(_organization_id, 'can_edit_opportunities') THEN
    RAISE EXCEPTION 'forbidden_edit_opportunities' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.opportunities
  WHERE id = _opportunity_id AND organization_id = _organization_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'opportunity_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_op.status::text NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'opportunity_not_closed' USING ERRCODE = '23514';
  END IF;

  IF v_op.status::text = 'lost' THEN
    SELECT s.id INTO v_target
    FROM public.opportunity_losses l
    JOIN public.pipeline_stages s ON s.id = l.stage_id_at_loss
    WHERE l.opportunity_id = _opportunity_id AND l.reopened_at IS NULL
      AND s.organization_id = _organization_id AND coalesce(s.type::text, 'custom') = 'custom';
  END IF;
  IF v_target IS NULL THEN
    SELECT id INTO v_target FROM public.pipeline_stages
    WHERE organization_id = _organization_id AND coalesce(type::text, 'custom') = 'custom'
    ORDER BY order_index LIMIT 1;
  END IF;
  IF v_target IS NULL THEN RAISE EXCEPTION 'open_stage_not_found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.opportunities
  SET pipeline_stage_id = v_target,
      status = 'open'::public.opportunity_status,
      close_date = NULL,
      updated_by = coalesce(public.current_user_id(), updated_by)
  WHERE id = _opportunity_id;

  RETURN jsonb_build_object('ok', true, 'status', 'open', 'target_stage_id', v_target,
    'source', coalesce(nullif(_source, ''), 'unknown'));
END $$;

-- Corrigir o motivo da perda em aberto. Permissão própria: ferramentas.corrigir_motivo_perda (ou perfil de sistema).
CREATE OR REPLACE FUNCTION public.correct_opportunity_loss_v1(
  _organization_id uuid,
  _opportunity_id uuid,
  _reason_id uuid,
  _detail_id uuid,
  _description text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loss public.opportunity_losses%rowtype;
  v_choice record;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.is_org_system_admin(_organization_id)
     AND NOT COALESCE((public.my_perms_v2(_organization_id) #>> '{ferramentas,corrigir_motivo_perda}')::boolean, false) THEN
    RAISE EXCEPTION 'forbidden_correct_loss' USING ERRCODE = '42501',
      HINT = 'Só quem tem a permissão "Corrigir motivo de perda" pode alterar o motivo de uma oportunidade perdida.';
  END IF;
  SELECT * INTO v_loss FROM public.opportunity_losses
  WHERE opportunity_id = _opportunity_id AND organization_id = _organization_id AND reopened_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loss_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_choice FROM public.fn_resolve_loss_choice_v1(
    _organization_id, _reason_id, _detail_id, _description, true);

  IF v_choice.reason_id IS NOT DISTINCT FROM v_loss.reason_id
     AND v_choice.detail_id IS NOT DISTINCT FROM v_loss.detail_id
     AND v_choice.description IS NOT DISTINCT FROM v_loss.description THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'loss_id', v_loss.id);
  END IF;

  INSERT INTO public.opportunity_loss_corrections (
    organization_id, loss_id, opportunity_id,
    old_reason_id, old_detail_id, old_reason_code, old_detail_code, old_description,
    new_reason_id, new_detail_id, new_reason_code, new_detail_code, new_description, corrected_by
  ) VALUES (
    _organization_id, v_loss.id, _opportunity_id,
    v_loss.reason_id, v_loss.detail_id, v_loss.reason_code, v_loss.detail_code, v_loss.description,
    v_choice.reason_id, v_choice.detail_id, v_choice.reason_code, v_choice.detail_code, v_choice.description,
    public.current_user_id()
  );
  UPDATE public.opportunity_losses
  SET reason_id = v_choice.reason_id, detail_id = v_choice.detail_id,
      reason_code = v_choice.reason_code, detail_code = v_choice.detail_code,
      description = v_choice.description
  WHERE id = v_loss.id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'loss_id', v_loss.id);
END $$;

-- Opções para a pessoa escolher: motivos ativos e, de cada um, os detalhes ativos que pessoas podem marcar.
-- reason_required já vem efetivo (false quando a org não tem motivo ativo).
CREATE OR REPLACE FUNCTION public.list_loss_reason_options_v1(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason_required boolean;
  v_detail_mode text;
  v_reasons jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT (_organization_id = ANY(public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_organization' USING ERRCODE = '42501';
  END IF;
  SELECT s.reason_required, s.detail_mode INTO v_reason_required, v_detail_mode
  FROM public.loss_settings_internal_v1(_organization_id) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'code', r.code, 'name', r.name,
    'details', CASE WHEN v_detail_mode = 'off' THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'code', d.code, 'name', d.name, 'help_text', d.help_text,
        'requires_description', d.requires_description
      ) ORDER BY d.order_index, d.name)
      FROM public.opportunity_loss_reason_details d
      WHERE d.reason_id = r.id AND d.is_active AND NOT d.automation_only
    ), '[]'::jsonb) END
  ) ORDER BY r.order_index, r.name), '[]'::jsonb) INTO v_reasons
  FROM public.opportunity_loss_reasons r
  WHERE r.organization_id = _organization_id AND r.is_active;

  RETURN jsonb_build_object(
    'reason_required', v_reason_required AND jsonb_array_length(v_reasons) > 0,
    'detail_mode', v_detail_mode,
    'reasons', v_reasons);
END $$;

-- Quantas perdas usam cada motivo/detalhe (a tela de cadastro trava código e botão de apagar com isso).
CREATE OR REPLACE FUNCTION public.loss_reason_usage_v1(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT (_organization_id = ANY(public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_organization' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'reasons', coalesce((
      SELECT jsonb_object_agg(r.id, (SELECT count(*) FROM public.opportunity_losses l WHERE l.reason_id = r.id))
      FROM public.opportunity_loss_reasons r
      WHERE r.organization_id = _organization_id AND public.loss_reason_is_used(r.id)
    ), '{}'::jsonb),
    'details', coalesce((
      SELECT jsonb_object_agg(d.id, (SELECT count(*) FROM public.opportunity_losses l WHERE l.detail_id = d.id))
      FROM public.opportunity_loss_reason_details d
      WHERE d.organization_id = _organization_id AND public.loss_detail_is_used(d.id)
    ), '{}'::jsonb));
END $$;

-- Trava + registro para os caminhos que não passam pela RPC. AFTER, para ver o status já sincronizado com a etapa.
-- auth.role() e não current_user: dentro das RPCs SECURITY DEFINER o JWT continua sendo do usuário.
CREATE OR REPLACE FUNCTION public.fn_guard_opportunity_lost_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_person boolean := COALESCE(auth.role(), '') = 'authenticated';
BEGIN
  IF current_setting('app.opportunity_loss_recorded', true) = NEW.id::text THEN RETURN NEW; END IF;

  IF v_person
     AND (SELECT s.reason_required FROM public.loss_settings_internal_v1(NEW.organization_id) s)
     AND EXISTS (SELECT 1 FROM public.opportunity_loss_reasons r
                 WHERE r.organization_id = NEW.organization_id AND r.is_active) THEN
    RAISE EXCEPTION 'loss_reason_required' USING ERRCODE = '23514',
      HINT = 'Escolha o motivo da perda.';
  END IF;

  INSERT INTO public.opportunity_losses (
    organization_id, opportunity_id, stage_id_at_loss, close_date, actor_type, actor_user_id, source
  ) VALUES (
    NEW.organization_id, NEW.id, OLD.pipeline_stage_id, NEW.close_date::date,
    CASE WHEN v_person THEN 'user' ELSE 'system' END, public.current_user_id(), 'direct_update'
  ) ON CONFLICT (opportunity_id) WHERE reopened_at IS NULL DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_opportunity_lost_v1
AFTER UPDATE ON public.opportunities
FOR EACH ROW
WHEN (NEW.status::text = 'lost' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.fn_guard_opportunity_lost_v1();

-- Admin de sistema recebe a chave nova (rbac_full_perms é a fonte do perfil Admin).
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.rbac_full_perms()'::regprocedure);
  n := replace(d, '"reabrir_oportunidade":true}', '"reabrir_oportunidade":true,"corrigir_motivo_perda":true}');
  IF n = d THEN RAISE EXCEPTION 'loss: rbac_full_perms trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

REVOKE ALL ON FUNCTION public.fn_resolve_loss_choice_v1(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_opportunity_lost_internal_v1(uuid, uuid, uuid, uuid, text, date, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_guard_opportunity_lost_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_opportunity_lost_v1(uuid, uuid, uuid, uuid, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_opportunities_lost_batch_v1(uuid, uuid[], uuid, uuid, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_opportunity_v1(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_opportunity_loss_v1(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_loss_reason_options_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.loss_reason_usage_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_loss_choice_v1(uuid, uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_mark_opportunity_lost_internal_v1(uuid, uuid, uuid, uuid, text, date, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_opportunity_lost_v1(uuid, uuid, uuid, uuid, text, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_opportunities_lost_batch_v1(uuid, uuid[], uuid, uuid, text, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_opportunity_v1(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_opportunity_loss_v1(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_loss_reason_options_v1(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.loss_reason_usage_v1(uuid) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

