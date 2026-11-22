-- Réguas: o número de envio passa a ser escolhido pelo provedor do template (Twilio ou Meta, e a mesma
-- integração), e não só pela linha comercial — várias orgs têm números ativos sem linha configurada.
-- Mesma função de antes (mesma assinatura), só o trecho do número mudou.

-- Decide o envio reservado, na hora: não contatar, oportunidade aberta, template aprovado, aceite,
-- janela, limite diário da org, limite semanal de marketing e template repetido em 7 dias.
-- Devolve {action: 'send' | 'rescheduled' | 'skipped' | 'cancelled' | 'failed', ...}.
CREATE OR REPLACE FUNCTION public.fn_cadence_prepare_send(p_send_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  s cadence_sends%ROWTYPE;
  st cadence_steps%ROWTYPE;
  e cadence_enrollments%ROWTYPE;
  r record;
  v_contact record;
  v_opp record;
  v_tpl record;
  v_next timestamptz;
  v_count integer;
  v_oldest timestamptz;
  v_endpoint uuid;
  v_tpl_provider text;
  v_tpl_integration uuid;
  v_thread uuid;
BEGIN
  SELECT * INTO s FROM cadence_sends WHERE id = p_send_id AND status = 'sending' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'gone'); END IF;
  SELECT * INTO e FROM cadence_enrollments WHERE id = s.enrollment_id;
  SELECT * INTO st FROM cadence_steps WHERE id = s.step_id;
  SELECT * INTO r FROM fn_cadence_rules(e.cadence_id);

  IF st.id IS NULL THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'passo removido da régua', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'passo removido da régua');
  END IF;

  SELECT id, do_not_contact, deleted_at, phone, owner_user_id INTO v_contact FROM contacts WHERE id = s.contact_id;
  IF v_contact.id IS NULL OR v_contact.deleted_at IS NOT NULL OR v_contact.do_not_contact IS TRUE THEN
    UPDATE cadence_sends SET status = 'cancelled', result_reason = 'não contatar', updated_at = now() WHERE id = s.id;
    PERFORM fn_cadence_end_enrollment(e.id, 'cancelled', 'não contatar');
    RETURN jsonb_build_object('action', 'cancelled', 'reason', 'não contatar');
  END IF;
  SELECT id, status, deleted_at, owner_user_id INTO v_opp FROM opportunities WHERE id = s.opportunity_id;
  IF v_opp.id IS NULL OR v_opp.deleted_at IS NOT NULL OR v_opp.status <> 'open' THEN
    UPDATE cadence_sends SET status = 'cancelled', result_reason = 'oportunidade não está aberta', updated_at = now() WHERE id = s.id;
    PERFORM fn_cadence_end_enrollment(e.id, 'cancelled', 'oportunidade não está aberta');
    RETURN jsonb_build_object('action', 'cancelled', 'reason', 'oportunidade não está aberta');
  END IF;

  -- Janela de envio (vale também para tarefa, para cair no horário da equipe).
  IF NOT st.ignore_send_window THEN
    v_next := fn_cadence_window_at(now(), r.windows, r.tz);
    IF v_next > now() + interval '1 minute' THEN
      UPDATE cadence_sends SET status = 'pending', scheduled_at = v_next, updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'rescheduled', 'reason', 'fora da janela de envio', 'scheduled_at', v_next);
    END IF;
  END IF;

  IF st.kind = 'task' THEN
    RETURN jsonb_build_object('action', 'send', 'kind', 'task',
      'organization_id', s.organization_id, 'contact_id', s.contact_id, 'opportunity_id', s.opportunity_id,
      'assigned_user_id', coalesce(v_opp.owner_user_id, v_contact.owner_user_id),
      'task_title', st.task_title, 'task_description', st.task_description,
      'task_due_minutes', st.task_due_minutes, 'task_priority', st.task_priority);
  END IF;

  -- WhatsApp
  SELECT id, status, is_active INTO v_tpl FROM whatsapp_templates WHERE id = st.template_id AND organization_id = s.organization_id;
  IF v_tpl.id IS NULL OR v_tpl.status <> 'approved' OR v_tpl.is_active IS FALSE THEN
    UPDATE cadence_sends SET status = 'failed', result_reason = 'template não aprovado ou desativado', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'failed', 'reason', 'template não aprovado ou desativado');
  END IF;
  IF coalesce(v_contact.phone, '') = '' THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'contato sem telefone', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'contato sem telefone');
  END IF;
  IF st.is_marketing AND NOT fn_contact_marketing_allowed(s.contact_id, 'whatsapp') THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'sem aceite de marketing', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'sem aceite de marketing');
  END IF;

  -- Mesmo template para o mesmo contato em 7 dias (de qualquer régua): pula.
  IF EXISTS (SELECT 1 FROM cadence_sends x WHERE x.contact_id = s.contact_id AND x.status = 'sent'
             AND x.template_id = st.template_id AND x.sent_at > now() - interval '7 days') THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'mesmo template enviado nos últimos 7 dias', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'mesmo template enviado nos últimos 7 dias');
  END IF;

  -- Limite diário da org (envios de WhatsApp das réguas no dia, no fuso da org).
  SELECT count(*) INTO v_count FROM cadence_sends x
  WHERE x.organization_id = s.organization_id AND x.status = 'sent' AND x.kind = 'whatsapp_template'
    AND x.sent_at >= (date_trunc('day', now() AT TIME ZONE r.tz) AT TIME ZONE r.tz);
  IF v_count >= r.daily_limit THEN
    v_next := fn_cadence_window_at((date_trunc('day', now() AT TIME ZONE r.tz) + interval '1 day') AT TIME ZONE r.tz, r.windows, r.tz);
    UPDATE cadence_sends SET status = 'pending', scheduled_at = v_next, updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'rescheduled', 'reason', 'limite diário de envios da organização', 'scheduled_at', v_next);
  END IF;

  -- Limite semanal de marketing por contato (7 dias corridos).
  IF st.is_marketing THEN
    SELECT count(*), min(x.sent_at) INTO v_count, v_oldest FROM (
      SELECT sent_at FROM cadence_sends WHERE contact_id = s.contact_id AND status = 'sent' AND is_marketing
        AND sent_at > now() - interval '7 days' ORDER BY sent_at DESC LIMIT greatest(r.weekly_limit, 1)) x;
    IF v_count >= r.weekly_limit THEN
      v_next := CASE WHEN r.weekly_limit = 0 THEN NULL ELSE fn_cadence_window_at(v_oldest + interval '7 days', r.windows, r.tz) END;
      IF v_next IS NULL THEN
        UPDATE cadence_sends SET status = 'skipped', result_reason = 'limite semanal de marketing é zero', updated_at = now() WHERE id = s.id;
        RETURN jsonb_build_object('action', 'skipped', 'reason', 'limite semanal de marketing é zero');
      END IF;
      UPDATE cadence_sends SET status = 'pending', scheduled_at = v_next, updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'rescheduled', 'reason', 'limite semanal de marketing do contato', 'scheduled_at', v_next);
    END IF;
  END IF;

  -- Número: um WhatsApp comercial ativo do mesmo provedor (e integração) do template.
  -- Preferência: o da linha comercial da org; senão o número em que o contato já conversa; senão o mais antigo.
  SELECT provider, organization_integration_id INTO v_tpl_provider, v_tpl_integration FROM whatsapp_templates WHERE id = st.template_id;
  SELECT ce.id INTO v_endpoint
  FROM communication_endpoints ce
  LEFT JOIN messaging_lines l ON l.active_endpoint_id = ce.id AND l.organization_id = ce.organization_id
    AND l.key = 'commercial' AND l.channel = 'whatsapp'
  LEFT JOIN LATERAL (
    SELECT max(t.updated_at) AS ts FROM message_threads t
    WHERE t.contact_id = s.contact_id AND t.primary_endpoint_id = ce.id AND t.merged_into_thread_id IS NULL
  ) ct ON true
  WHERE ce.organization_id = s.organization_id AND ce.is_active AND ce.channel = 'whatsapp' AND ce.purpose = 'commercial'
    AND ce.provider = v_tpl_provider
    AND (v_tpl_integration IS NULL OR ce.organization_integration_id = v_tpl_integration)
  ORDER BY (l.id IS NOT NULL) DESC, ct.ts DESC NULLS LAST, ce.created_at
  LIMIT 1;
  IF v_endpoint IS NULL THEN
    UPDATE cadence_sends SET status = 'failed', result_reason = 'nenhum WhatsApp comercial ativo do mesmo provedor do template', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'failed', 'reason', 'nenhum WhatsApp comercial ativo do mesmo provedor do template');
  END IF;
  SELECT t.id INTO v_thread FROM message_threads t
  WHERE t.organization_id = s.organization_id AND t.contact_id = s.contact_id AND t.channel = 'whatsapp'
    AND t.merged_into_thread_id IS NULL AND t.primary_endpoint_id = v_endpoint
  ORDER BY t.updated_at DESC LIMIT 1;

  UPDATE cadence_sends SET template_id = st.template_id, updated_at = now() WHERE id = s.id;
  RETURN jsonb_build_object('action', 'send', 'kind', 'whatsapp_template',
    'organization_id', s.organization_id, 'contact_id', s.contact_id, 'opportunity_id', s.opportunity_id,
    'owner_user_id', v_opp.owner_user_id, 'template_id', st.template_id, 'template_variables', st.template_variables,
    'endpoint_id', v_endpoint, 'thread_id', v_thread);
END $function$;
