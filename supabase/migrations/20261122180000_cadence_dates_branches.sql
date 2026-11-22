-- Réguas — fase 5 (parte 2): gatilho "um campo recebe um valor", passo marcado por uma data de campo
-- (ex.: 2 dias antes da validade da proposta) e ramos (passo só sai se um campo bater). Vale para todas as orgs.
-- A condição e a data são lidas na hora do envio; mudar a data do campo reagenda os envios pendentes.

ALTER TABLE public.cadences DROP CONSTRAINT IF EXISTS cadences_trigger_type_check;
ALTER TABLE public.cadences ADD CONSTRAINT cadences_trigger_type_check CHECK (trigger_type IN ('stage_entered', 'manual', 'field_value'));
ALTER TABLE public.cadences ADD COLUMN IF NOT EXISTS trigger_field_id uuid REFERENCES public.custom_field_definitions(id) ON DELETE SET NULL;
ALTER TABLE public.cadences ADD COLUMN IF NOT EXISTS trigger_field_value text;  -- null = qualquer valor
ALTER TABLE public.cadences DROP CONSTRAINT IF EXISTS cadences_check;
ALTER TABLE public.cadences ADD CONSTRAINT cadences_check CHECK (
  is_active = false OR trigger_type = 'manual'
  OR (trigger_type = 'stage_entered' AND trigger_stage_id IS NOT NULL)
  OR (trigger_type = 'field_value' AND trigger_field_id IS NOT NULL));

ALTER TABLE public.cadence_steps ADD COLUMN IF NOT EXISTS timing text NOT NULL DEFAULT 'after_enrollment'
  CHECK (timing IN ('after_enrollment', 'field_date'));
ALTER TABLE public.cadence_steps ADD COLUMN IF NOT EXISTS timing_field_id uuid REFERENCES public.custom_field_definitions(id) ON DELETE SET NULL;
ALTER TABLE public.cadence_steps ADD COLUMN IF NOT EXISTS timing_offset_minutes integer NOT NULL DEFAULT 0
  CHECK (timing_offset_minutes BETWEEN -525600 AND 525600);
ALTER TABLE public.cadence_steps ADD COLUMN IF NOT EXISTS timing_local_time time NOT NULL DEFAULT '09:00';
-- {"field_definition_id": "...", "operator": "equals|not_equals|is_empty|is_filled", "value": "..."}; null = sempre
ALTER TABLE public.cadence_steps ADD COLUMN IF NOT EXISTS condition jsonb;

-- Guardas: campos das regras são da mesma org; passo por data precisa de um campo de data.
CREATE OR REPLACE FUNCTION public.fn_cadence_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.trigger_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages s WHERE s.id = NEW.trigger_stage_id AND s.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'stage_org_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NEW.trigger_field_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_definitions d WHERE d.id = NEW.trigger_field_id AND d.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'field_org_mismatch' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_cadence_step_extra_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.timing = 'field_date' AND NOT EXISTS (
    SELECT 1 FROM custom_field_definitions d WHERE d.id = NEW.timing_field_id AND d.organization_id = NEW.organization_id AND d.field_type = 'date') THEN
    RAISE EXCEPTION 'timing_field_must_be_date' USING ERRCODE = '22023';
  END IF;
  IF NEW.condition IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM custom_field_definitions d WHERE d.id = (NEW.condition->>'field_definition_id')::uuid AND d.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'condition_field_invalid' USING ERRCODE = '22023';
    END IF;
    IF coalesce(NEW.condition->>'operator', '') NOT IN ('equals', 'not_equals', 'is_empty', 'is_filled') THEN
      RAISE EXCEPTION 'condition_operator_invalid' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_cadence_step_extra_guard ON public.cadence_steps;
CREATE TRIGGER trg_cadence_step_extra_guard BEFORE INSERT OR UPDATE ON public.cadence_steps
  FOR EACH ROW EXECUTE FUNCTION public.fn_cadence_step_extra_guard();

-- Valor atual de um campo customizado para a oportunidade (ou o contato, se o campo for de contato).
CREATE OR REPLACE FUNCTION public.fn_cadence_field_value(p_field uuid, p_opp uuid, p_contact uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT v.value FROM custom_field_definitions d
  JOIN custom_field_values v ON v.field_definition_id = d.id
    AND v.record_id = CASE WHEN d.module = 'contacts' THEN p_contact ELSE p_opp END
  WHERE d.id = p_field LIMIT 1;
$function$;

-- Ramo: o passo sai? Sem condição = sim. Texto comparado sem maiúscula; múltipla escolha "contém".
CREATE OR REPLACE FUNCTION public.fn_cadence_condition_ok(p_cond jsonb, p_opp uuid, p_contact uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v jsonb; v_text text; v_want text := lower(btrim(coalesce(p_cond->>'value', ''))); v_filled boolean; v_match boolean;
BEGIN
  IF p_cond IS NULL OR jsonb_typeof(p_cond) <> 'object' THEN RETURN true; END IF;
  v := fn_cadence_field_value((p_cond->>'field_definition_id')::uuid, p_opp, p_contact);
  IF v IS NULL OR v = 'null'::jsonb THEN v_filled := false;
  ELSIF jsonb_typeof(v) = 'array' THEN v_filled := jsonb_array_length(v) > 0;
  ELSE v_filled := btrim(v #>> '{}') <> '';
  END IF;
  IF p_cond->>'operator' = 'is_empty' THEN RETURN NOT v_filled; END IF;
  IF p_cond->>'operator' = 'is_filled' THEN RETURN v_filled; END IF;
  IF jsonb_typeof(v) = 'array' THEN
    v_match := EXISTS (SELECT 1 FROM jsonb_array_elements_text(v) x WHERE lower(btrim(x)) = v_want);
  ELSE
    v_text := lower(btrim(coalesce(v #>> '{}', '')));
    v_match := v_filled AND v_text = v_want;
  END IF;
  RETURN CASE WHEN p_cond->>'operator' = 'not_equals' THEN NOT v_match ELSE v_match END;
END $function$;

-- Quando o passo sai: depois da entrada (tempo) ou em relação a uma data de campo (data + hora local + ajuste).
-- null = campo de data vazio ou inválido.
CREATE OR REPLACE FUNCTION public.fn_cadence_step_at(p_step uuid, p_opp uuid, p_contact uuid, p_base timestamptz, p_windows jsonb, p_tz text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE st cadence_steps%ROWTYPE; v jsonb; v_date date; v_at timestamptz;
BEGIN
  SELECT * INTO st FROM cadence_steps WHERE id = p_step;
  IF st.id IS NULL THEN RETURN NULL; END IF;
  IF st.timing = 'field_date' THEN
    v := fn_cadence_field_value(st.timing_field_id, p_opp, p_contact);
    BEGIN v_date := left(v #>> '{}', 10)::date; EXCEPTION WHEN others THEN RETURN NULL; END;
    IF v_date IS NULL THEN RETURN NULL; END IF;
    v_at := ((v_date + st.timing_local_time) AT TIME ZONE p_tz) + make_interval(mins => st.timing_offset_minutes);
  ELSE
    v_at := p_base + make_interval(mins => st.delay_minutes);
  END IF;
  IF NOT st.ignore_send_window THEN v_at := fn_cadence_window_at(v_at, p_windows, p_tz); END IF;
  RETURN v_at;
END $function$;

-- Inscrição: horário de cada passo pela função nova (tempo ou data de campo).
CREATE OR REPLACE FUNCTION public.fn_cadence_enroll(p_cadence_id uuid, p_opportunity_id uuid, p_source text, p_actor uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_cad cadences%ROWTYPE;
  v_opp record;
  v_rules record;
  v_id uuid;
  v_other uuid;
  v_step record;
  v_at timestamptz;
BEGIN
  SELECT * INTO v_cad FROM cadences WHERE id = p_cadence_id AND deleted_at IS NULL AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'cadence_not_active' USING ERRCODE = '22023'; END IF;
  SELECT id, organization_id, contact_id, status, deleted_at INTO v_opp FROM opportunities WHERE id = p_opportunity_id;
  IF v_opp.id IS NULL OR v_opp.deleted_at IS NOT NULL OR v_opp.organization_id <> v_cad.organization_id THEN
    RAISE EXCEPTION 'opportunity_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_opp.status <> 'open' THEN RAISE EXCEPTION 'opportunity_not_open' USING ERRCODE = '22023'; END IF;
  IF v_opp.contact_id IS NULL THEN RAISE EXCEPTION 'opportunity_without_contact' USING ERRCODE = '22023'; END IF;

  SELECT id INTO v_id FROM cadence_enrollments
  WHERE opportunity_id = p_opportunity_id AND cadence_id = p_cadence_id AND status IN ('active', 'paused');
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  FOR v_other IN SELECT id FROM cadence_enrollments WHERE opportunity_id = p_opportunity_id AND status IN ('active', 'paused') LOOP
    PERFORM fn_cadence_end_enrollment(v_other, 'cancelled', 'entrou em outra régua');
  END LOOP;

  INSERT INTO cadence_enrollments (organization_id, cadence_id, opportunity_id, contact_id, source, enrolled_by)
  VALUES (v_cad.organization_id, p_cadence_id, p_opportunity_id, v_opp.contact_id, p_source, p_actor)
  RETURNING id INTO v_id;

  SELECT * INTO v_rules FROM fn_cadence_rules(p_cadence_id);
  FOR v_step IN SELECT * FROM cadence_steps WHERE cadence_id = p_cadence_id ORDER BY position, delay_minutes LOOP
    -- Passo por data de campo sem data ainda: agenda para já e a decisão do envio pula ou reagenda.
    v_at := coalesce(fn_cadence_step_at(v_step.id, p_opportunity_id, v_opp.contact_id, now(), v_rules.windows, v_rules.tz), now());
    INSERT INTO cadence_sends (organization_id, enrollment_id, step_id, contact_id, opportunity_id, kind, is_marketing, template_id, scheduled_at)
    VALUES (v_cad.organization_id, v_id, v_step.id, v_opp.contact_id, p_opportunity_id, v_step.kind, v_step.is_marketing, v_step.template_id, v_at);
  END LOOP;
  RETURN v_id;
END $function$;


-- Decisão do envio: mesma da fase 4, mais a condição (ramo) e a data de campo lidas na hora.
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
  v_email_tpl record;
  v_settings record;
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

  SELECT id, do_not_contact, deleted_at, phone, email, email_invalid_at, owner_user_id INTO v_contact FROM contacts WHERE id = s.contact_id;
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

  -- Ramo: condição por campo, lida agora (o campo pode ter sido preenchido depois da inscrição).
  IF NOT fn_cadence_condition_ok(st.condition, s.opportunity_id, s.contact_id) THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'condição do passo não atendida', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'condição do passo não atendida');
  END IF;

  -- Passo marcado por uma data de campo: recalcula com o valor atual do campo.
  IF st.timing = 'field_date' THEN
    v_next := fn_cadence_step_at(st.id, s.opportunity_id, s.contact_id, e.enrolled_at, r.windows, r.tz);
    IF v_next IS NULL THEN
      UPDATE cadence_sends SET status = 'skipped', result_reason = 'campo de data vazio', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'skipped', 'reason', 'campo de data vazio');
    END IF;
    IF v_next > now() + interval '1 minute' THEN
      UPDATE cadence_sends SET status = 'pending', scheduled_at = v_next, updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'rescheduled', 'reason', 'aguardando a data do campo', 'scheduled_at', v_next);
    END IF;
    IF v_next < now() - interval '1 day' THEN
      UPDATE cadence_sends SET status = 'skipped', result_reason = 'a data do campo já passou', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'skipped', 'reason', 'a data do campo já passou');
    END IF;
  END IF;

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

  -- Comum a WhatsApp e e-mail: aceite de marketing, repetição em 7 dias, limite diário e semanal.
  IF st.kind = 'whatsapp_template' THEN
    SELECT id, status, is_active INTO v_tpl FROM whatsapp_templates WHERE id = st.template_id AND organization_id = s.organization_id;
    IF v_tpl.id IS NULL OR v_tpl.status <> 'approved' OR v_tpl.is_active IS FALSE THEN
      UPDATE cadence_sends SET status = 'failed', result_reason = 'template não aprovado ou desativado', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'failed', 'reason', 'template não aprovado ou desativado');
    END IF;
    IF coalesce(v_contact.phone, '') = '' THEN
      UPDATE cadence_sends SET status = 'skipped', result_reason = 'contato sem telefone', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'skipped', 'reason', 'contato sem telefone');
    END IF;
  ELSE
    SELECT id, is_marketing, deleted_at INTO v_email_tpl FROM email_templates WHERE id = st.email_template_id AND organization_id = s.organization_id;
    IF v_email_tpl.id IS NULL OR v_email_tpl.deleted_at IS NOT NULL THEN
      UPDATE cadence_sends SET status = 'failed', result_reason = 'modelo de e-mail removido', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'failed', 'reason', 'modelo de e-mail removido');
    END IF;
    SELECT status, from_email INTO v_settings FROM organization_email_settings WHERE organization_id = s.organization_id;
    IF v_settings.status IS DISTINCT FROM 'connected' OR coalesce(v_settings.from_email, '') = '' THEN
      UPDATE cadence_sends SET status = 'failed', result_reason = 'e-mail da organização não conectado', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'failed', 'reason', 'e-mail da organização não conectado');
    END IF;
    IF coalesce(v_contact.email, '') = '' THEN
      UPDATE cadence_sends SET status = 'skipped', result_reason = 'contato sem e-mail', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'skipped', 'reason', 'contato sem e-mail');
    END IF;
    IF v_contact.email_invalid_at IS NOT NULL THEN
      UPDATE cadence_sends SET status = 'skipped', result_reason = 'e-mail do contato inválido (devolvido ou spam)', updated_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('action', 'skipped', 'reason', 'e-mail do contato inválido (devolvido ou spam)');
    END IF;
  END IF;

  IF st.is_marketing AND NOT fn_contact_marketing_allowed(s.contact_id, CASE WHEN st.kind = 'email' THEN 'email' ELSE 'whatsapp' END) THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'sem aceite de marketing', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'sem aceite de marketing');
  END IF;

  IF st.kind = 'whatsapp_template' AND EXISTS (SELECT 1 FROM cadence_sends x WHERE x.contact_id = s.contact_id AND x.status = 'sent'
             AND x.template_id = st.template_id AND x.sent_at > now() - interval '7 days') THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'mesmo template enviado nos últimos 7 dias', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'mesmo template enviado nos últimos 7 dias');
  END IF;
  IF st.kind = 'email' AND EXISTS (SELECT 1 FROM email_messages x WHERE x.contact_id = s.contact_id AND x.template_id = st.email_template_id
             AND x.status NOT IN ('failed', 'queued') AND x.created_at > now() - interval '7 days') THEN
    UPDATE cadence_sends SET status = 'skipped', result_reason = 'mesmo modelo de e-mail enviado nos últimos 7 dias', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'skipped', 'reason', 'mesmo modelo de e-mail enviado nos últimos 7 dias');
  END IF;

  SELECT count(*) INTO v_count FROM cadence_sends x
  WHERE x.organization_id = s.organization_id AND x.status = 'sent' AND x.kind IN ('whatsapp_template', 'email')
    AND x.sent_at >= (date_trunc('day', now() AT TIME ZONE r.tz) AT TIME ZONE r.tz);
  IF v_count >= r.daily_limit THEN
    v_next := fn_cadence_window_at((date_trunc('day', now() AT TIME ZONE r.tz) + interval '1 day') AT TIME ZONE r.tz, r.windows, r.tz);
    UPDATE cadence_sends SET status = 'pending', scheduled_at = v_next, updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'rescheduled', 'reason', 'limite diário de envios da organização', 'scheduled_at', v_next);
  END IF;

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

  IF st.kind = 'email' THEN
    RETURN jsonb_build_object('action', 'send', 'kind', 'email',
      'organization_id', s.organization_id, 'contact_id', s.contact_id, 'opportunity_id', s.opportunity_id,
      'owner_user_id', v_opp.owner_user_id, 'email_template_id', st.email_template_id, 'to_email', v_contact.email,
      'is_marketing', st.is_marketing);
  END IF;

  -- WhatsApp: número comercial ativo do mesmo provedor (e integração) do template.
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


-- Campo customizado mudou: (1) entra nas réguas "um campo recebe um valor"; (2) reagenda os envios pendentes
-- que dependem dessa data. Campo de contato vale para a oportunidade aberta mais recente do contato.
CREATE OR REPLACE FUNCTION public.fn_cadence_on_field_value()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_def record; v_opp uuid; v_contact uuid; v_c record; v_s record; r record; v_at timestamptz; v_text text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN RETURN NULL; END IF;
  BEGIN
    SELECT id, module, organization_id INTO v_def FROM custom_field_definitions WHERE id = NEW.field_definition_id;
    IF v_def.module = 'contacts' THEN
      v_contact := NEW.record_id;
      SELECT id INTO v_opp FROM opportunities WHERE contact_id = v_contact AND status = 'open' AND deleted_at IS NULL
      ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    ELSE
      v_opp := NEW.record_id;
      SELECT contact_id INTO v_contact FROM opportunities WHERE id = v_opp AND status = 'open' AND deleted_at IS NULL;
      IF v_contact IS NULL THEN v_opp := NULL; END IF;
    END IF;

    v_text := lower(btrim(CASE WHEN jsonb_typeof(NEW.value) = 'array' THEN '' ELSE coalesce(NEW.value #>> '{}', '') END));
    IF v_opp IS NOT NULL AND (v_text <> '' OR (jsonb_typeof(NEW.value) = 'array' AND jsonb_array_length(NEW.value) > 0)) THEN
      FOR v_c IN
        SELECT id FROM cadences
        WHERE organization_id = v_def.organization_id AND trigger_type = 'field_value' AND trigger_field_id = NEW.field_definition_id
          AND is_active AND deleted_at IS NULL
          AND (trigger_field_value IS NULL OR btrim(trigger_field_value) = ''
               OR lower(btrim(trigger_field_value)) = v_text
               OR (jsonb_typeof(NEW.value) = 'array' AND EXISTS (
                     SELECT 1 FROM jsonb_array_elements_text(NEW.value) x WHERE lower(btrim(x)) = lower(btrim(trigger_field_value)))))
        ORDER BY created_at LIMIT 1
      LOOP
        PERFORM fn_cadence_enroll(v_c.id, v_opp, 'stage', NULL);
      END LOOP;
    END IF;

    -- Reagenda envios pendentes que usam esta data.
    FOR v_s IN
      SELECT cs.id, cs.step_id, cs.opportunity_id, cs.contact_id, e.cadence_id, e.enrolled_at
      FROM cadence_sends cs
      JOIN cadence_steps st ON st.id = cs.step_id AND st.timing = 'field_date' AND st.timing_field_id = NEW.field_definition_id
      JOIN cadence_enrollments e ON e.id = cs.enrollment_id AND e.status IN ('active', 'paused')
      WHERE cs.status = 'pending'
        AND (CASE WHEN v_def.module = 'contacts' THEN cs.contact_id ELSE cs.opportunity_id END) = NEW.record_id
    LOOP
      SELECT * INTO r FROM fn_cadence_rules(v_s.cadence_id);
      v_at := fn_cadence_step_at(v_s.step_id, v_s.opportunity_id, v_s.contact_id, v_s.enrolled_at, r.windows, r.tz);
      UPDATE cadence_sends SET scheduled_at = coalesce(v_at, now()), updated_at = now() WHERE id = v_s.id;
    END LOOP;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[cadence] field value % trigger failed: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS trg_cadence_on_field_value ON public.custom_field_values;
CREATE TRIGGER trg_cadence_on_field_value AFTER INSERT OR UPDATE OF value ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.fn_cadence_on_field_value();

REVOKE ALL ON FUNCTION public.fn_cadence_field_value(uuid, uuid, uuid), public.fn_cadence_condition_ok(jsonb, uuid, uuid),
  public.fn_cadence_step_at(uuid, uuid, uuid, timestamptz, jsonb, text), public.fn_cadence_on_field_value(),
  public.fn_cadence_step_extra_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cadence_field_value(uuid, uuid, uuid), public.fn_cadence_condition_ok(jsonb, uuid, uuid),
  public.fn_cadence_step_at(uuid, uuid, uuid, timestamptz, jsonb, text) TO service_role;
