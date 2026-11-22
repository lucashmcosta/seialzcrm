-- Réguas — fase 3: o toque num botão do WhatsApp vira ação no CRM. Vale para todas as organizações.
--
-- whatsapp_button_rules  : por org, "template (ou qualquer um) + texto do botão" → lista de ações.
-- whatsapp_button_events : cada toque recebido (uma vez por mensagem), com o resultado de cada ação.
--
-- Os webhooks (Meta e Twilio) gravam o botão em messages.metadata.interactive_reply e a mensagem
-- respondida em reply_to_message_id (de onde sai o template). Um gatilho na inserção da mensagem
-- aplica as ações na hora. "Enviar template" fica pendente no evento e o robô das réguas envia
-- (até 1 minuto). Nenhuma ação marca a oportunidade como perdida.
--
-- Ações (jsonb, em ordem):
--   {"type":"move_stage","stage_id":"..."}                 só etapas abertas (não ganha/perdida)
--   {"type":"set_field","field_definition_id":"...","value":...}
--   {"type":"create_task","title":"...","description":"...","due_minutes":60,"priority":"high"}
--   {"type":"enroll_cadence","cadence_id":"..."}
--   {"type":"cancel_cadence"}
--   {"type":"set_consent","channel":"all|whatsapp|email","granted":false}
--   {"type":"send_template","template_id":"...","variables":{"1":"{{contact.first_name}}"}}

CREATE OR REPLACE FUNCTION public.fn_button_key(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT nullif(btrim(regexp_replace(lower(translate(coalesce(p_text, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', ' ', 'g')), '');
$function$;

CREATE TABLE IF NOT EXISTS public.whatsapp_button_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE CASCADE,  -- null = botão com esse texto em qualquer template
  button_text text NOT NULL CHECK (length(trim(button_text)) > 0),
  button_key text NOT NULL,
  counts_as_reply boolean NOT NULL DEFAULT true,  -- false = não conta como resposta para a régua (ela segue)
  actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(actions) = 'array'),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_button_rule ON public.whatsapp_button_rules
  (organization_id, coalesce(template_id, '00000000-0000-0000-0000-000000000000'::uuid), button_key);

CREATE TABLE IF NOT EXISTS public.whatsapp_button_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  thread_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  template_id uuid,
  button_text text,
  rule_id uuid REFERENCES public.whatsapp_button_rules(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('applied', 'partial', 'failed', 'no_rule')),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_sends jsonb NOT NULL DEFAULT '[]'::jsonb,
  sends_status text NOT NULL DEFAULT 'none' CHECK (sends_status IN ('none', 'pending', 'sending', 'done', 'failed')),
  sends_claimed_at timestamptz,
  sends_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_button_events_org ON public.whatsapp_button_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_button_events_sends ON public.whatsapp_button_events (created_at) WHERE sends_status = 'pending';

ALTER TABLE public.whatsapp_button_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_button_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read whatsapp_button_rules" ON public.whatsapp_button_rules;
CREATE POLICY "Org members read whatsapp_button_rules" ON public.whatsapp_button_rules
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
DROP POLICY IF EXISTS "Org admins write whatsapp_button_rules" ON public.whatsapp_button_rules;
CREATE POLICY "Org admins write whatsapp_button_rules" ON public.whatsapp_button_rules
  FOR ALL TO authenticated USING (is_org_system_admin(organization_id)) WITH CHECK (is_org_system_admin(organization_id));
DROP POLICY IF EXISTS "Org members read whatsapp_button_events" ON public.whatsapp_button_events;
CREATE POLICY "Org members read whatsapp_button_events" ON public.whatsapp_button_events
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
REVOKE ALL ON public.whatsapp_button_rules, public.whatsapp_button_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_button_events FROM authenticated;

-- Regra: chave do botão calculada; template e etapas/réguas/campos nas ações têm de ser da mesma org.
CREATE OR REPLACE FUNCTION public.fn_button_rule_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE a jsonb;
BEGIN
  NEW.button_key := fn_button_key(NEW.button_text);
  IF NEW.button_key IS NULL THEN RAISE EXCEPTION 'button_text_required' USING ERRCODE = '22023'; END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM whatsapp_templates WHERE id = NEW.template_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'template_org_mismatch' USING ERRCODE = '42501';
  END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(NEW.actions) LOOP
    IF a->>'type' NOT IN ('move_stage', 'set_field', 'create_task', 'enroll_cadence', 'cancel_cadence', 'set_consent', 'send_template') THEN
      RAISE EXCEPTION 'invalid_action_type: %', a->>'type' USING ERRCODE = '22023';
    END IF;
    IF a->>'type' = 'move_stage' AND NOT EXISTS (
      SELECT 1 FROM pipeline_stages WHERE id = (a->>'stage_id')::uuid AND organization_id = NEW.organization_id AND type = 'custom') THEN
      RAISE EXCEPTION 'stage_invalid' USING ERRCODE = '22023';
    END IF;
    IF a->>'type' = 'enroll_cadence' AND NOT EXISTS (
      SELECT 1 FROM cadences WHERE id = (a->>'cadence_id')::uuid AND organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'cadence_invalid' USING ERRCODE = '22023';
    END IF;
    IF a->>'type' = 'set_field' AND NOT EXISTS (
      SELECT 1 FROM custom_field_definitions WHERE id = (a->>'field_definition_id')::uuid AND organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'field_invalid' USING ERRCODE = '22023';
    END IF;
    IF a->>'type' = 'send_template' AND NOT EXISTS (
      SELECT 1 FROM whatsapp_templates WHERE id = (a->>'template_id')::uuid AND organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'template_invalid' USING ERRCODE = '22023';
    END IF;
    IF a->>'type' = 'create_task' AND length(trim(coalesce(a->>'title', ''))) = 0 THEN
      RAISE EXCEPTION 'task_title_required' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_button_rule_guard ON public.whatsapp_button_rules;
CREATE TRIGGER trg_button_rule_guard BEFORE INSERT OR UPDATE ON public.whatsapp_button_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_button_rule_guard();

-- A regra que vale para esta mensagem recebida (template exato primeiro, depois "qualquer template").
CREATE OR REPLACE FUNCTION public.fn_button_rule_for_message(p_org uuid, p_reply_to uuid, p_metadata jsonb)
RETURNS TABLE (rule_id uuid, template_id uuid, button_text text, counts_as_reply boolean, actions jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH btn AS (
    SELECT coalesce(nullif(p_metadata->'interactive_reply'->>'title', ''), p_metadata->'interactive_reply'->>'id') AS txt,
           (SELECT m.template_id FROM messages m WHERE m.id = p_reply_to) AS tpl
    WHERE p_metadata->'interactive_reply'->>'kind' IN ('template_button', 'button')
  )
  SELECT r.id, btn.tpl, btn.txt, r.counts_as_reply, r.actions
  FROM btn
  JOIN whatsapp_button_rules r ON r.organization_id = p_org AND r.is_active
    AND r.button_key = fn_button_key(btn.txt)
    AND (r.template_id IS NULL OR r.template_id = btn.tpl)
  ORDER BY (r.template_id IS NOT NULL) DESC
  LIMIT 1;
$function$;

-- Aplica as ações do botão. Cada ação vale sozinha: se uma falha, as outras seguem e o motivo fica no evento.
CREATE OR REPLACE FUNCTION public.fn_button_apply(p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  m record;
  v_rule record;
  v_contact uuid;
  v_opp uuid;
  v_owner uuid;
  a jsonb;
  v_results jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_fail integer := 0;
  v_def record;
  v_record uuid;
  v_e record;
  v_text text;
BEGIN
  SELECT id, organization_id, thread_id, reply_to_message_id, metadata INTO m FROM messages WHERE id = p_message_id;
  IF m.id IS NULL OR m.metadata->'interactive_reply' IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM whatsapp_button_events WHERE message_id = m.id) THEN RETURN NULL; END IF;

  SELECT contact_id INTO v_contact FROM message_threads WHERE id = m.thread_id;
  SELECT * INTO v_rule FROM fn_button_rule_for_message(m.organization_id, m.reply_to_message_id, m.metadata);
  v_text := coalesce(nullif(m.metadata->'interactive_reply'->>'title', ''), m.metadata->'interactive_reply'->>'id');

  IF v_rule.rule_id IS NULL THEN
    -- Botão sem regra: só registra (a mensagem segue como hoje).
    IF m.metadata->'interactive_reply'->>'kind' IN ('template_button', 'button') THEN
      INSERT INTO whatsapp_button_events (organization_id, message_id, thread_id, contact_id, template_id, button_text, status)
      VALUES (m.organization_id, m.id, m.thread_id, v_contact,
        (SELECT template_id FROM messages WHERE id = m.reply_to_message_id), left(v_text, 200), 'no_rule');
    END IF;
    RETURN NULL;
  END IF;

  -- Oportunidade: a da régua ativa do contato; senão a aberta mais recente.
  SELECT e.opportunity_id INTO v_opp FROM cadence_enrollments e
  WHERE e.contact_id = v_contact AND e.status IN ('active', 'paused') ORDER BY e.enrolled_at DESC LIMIT 1;
  IF v_opp IS NULL THEN
    SELECT o.id INTO v_opp FROM opportunities o
    WHERE o.contact_id = v_contact AND o.organization_id = m.organization_id AND o.status = 'open' AND o.deleted_at IS NULL
    ORDER BY o.updated_at DESC NULLS LAST LIMIT 1;
  END IF;
  -- Se a régua acabou de ser encerrada por esta resposta, a oportunidade dela ainda é a certa.
  IF v_opp IS NULL THEN
    SELECT e.opportunity_id INTO v_opp FROM cadence_enrollments e
    WHERE e.contact_id = v_contact AND e.ended_at > now() - interval '1 minute' ORDER BY e.ended_at DESC LIMIT 1;
  END IF;

  FOR a IN SELECT * FROM jsonb_array_elements(v_rule.actions) LOOP
    BEGIN
      CASE a->>'type'
      WHEN 'move_stage' THEN
        IF v_opp IS NULL THEN RAISE EXCEPTION 'sem oportunidade aberta'; END IF;
        IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE id = (a->>'stage_id')::uuid AND organization_id = m.organization_id AND type = 'custom') THEN
          RAISE EXCEPTION 'etapa inválida';
        END IF;
        UPDATE opportunities SET pipeline_stage_id = (a->>'stage_id')::uuid
        WHERE id = v_opp AND status = 'open' AND pipeline_stage_id IS DISTINCT FROM (a->>'stage_id')::uuid;
      WHEN 'set_field' THEN
        SELECT id, module INTO v_def FROM custom_field_definitions WHERE id = (a->>'field_definition_id')::uuid AND organization_id = m.organization_id;
        IF v_def.id IS NULL THEN RAISE EXCEPTION 'campo inválido'; END IF;
        v_record := CASE WHEN v_def.module = 'contacts' THEN v_contact ELSE v_opp END;
        IF v_record IS NULL THEN RAISE EXCEPTION 'sem registro para o campo'; END IF;
        INSERT INTO custom_field_values (organization_id, module, record_id, field_definition_id, value)
        VALUES (m.organization_id, v_def.module, v_record, v_def.id, a->'value')
        ON CONFLICT (record_id, field_definition_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
      WHEN 'create_task' THEN
        SELECT coalesce(o.owner_user_id, c.owner_user_id, t.assigned_user_id) INTO v_owner
        FROM contacts c
        LEFT JOIN opportunities o ON o.id = v_opp
        LEFT JOIN message_threads t ON t.id = m.thread_id
        WHERE c.id = v_contact;
        IF v_owner IS NULL THEN RAISE EXCEPTION 'sem responsável para a tarefa'; END IF;
        INSERT INTO tasks (organization_id, contact_id, opportunity_id, thread_id, assigned_user_id, title, description, task_type, status, priority, due_at)
        VALUES (m.organization_id, v_contact, v_opp, m.thread_id, v_owner, left(a->>'title', 200), a->>'description', 'follow_up', 'open'::task_status,
          (CASE WHEN a->>'priority' IN ('low', 'medium', 'high') THEN a->>'priority' ELSE 'medium' END)::task_priority,
          now() + make_interval(mins => coalesce((a->>'due_minutes')::int, 60)));
      WHEN 'enroll_cadence' THEN
        IF v_opp IS NULL THEN RAISE EXCEPTION 'sem oportunidade aberta'; END IF;
        PERFORM fn_cadence_enroll((a->>'cadence_id')::uuid, v_opp, 'manual', NULL);
      WHEN 'cancel_cadence' THEN
        FOR v_e IN SELECT id FROM cadence_enrollments WHERE contact_id = v_contact AND status IN ('active', 'paused') LOOP
          PERFORM fn_cadence_end_enrollment(v_e.id, 'cancelled', 'botão do WhatsApp');
        END LOOP;
      WHEN 'set_consent' THEN
        PERFORM rpc_set_contact_consent_v1(v_contact, coalesce(a->>'channel', 'all'), coalesce((a->>'granted')::boolean, false),
          'whatsapp_button', left(v_text, 100));
      WHEN 'send_template' THEN
        v_pending := v_pending || jsonb_build_array(jsonb_build_object('template_id', a->>'template_id', 'variables', coalesce(a->'variables', '{}'::jsonb)));
      END CASE;
      v_results := v_results || jsonb_build_array(jsonb_build_object('type', a->>'type', 'ok', true));
      v_ok := v_ok + 1;
    EXCEPTION WHEN others THEN
      v_results := v_results || jsonb_build_array(jsonb_build_object('type', a->>'type', 'ok', false, 'error', left(SQLERRM, 200)));
      v_fail := v_fail + 1;
    END;
  END LOOP;

  INSERT INTO whatsapp_button_events (organization_id, message_id, thread_id, contact_id, opportunity_id, template_id, button_text, rule_id,
    status, results, pending_sends, sends_status)
  VALUES (m.organization_id, m.id, m.thread_id, v_contact, v_opp, v_rule.template_id, left(v_text, 200), v_rule.rule_id,
    CASE WHEN v_fail = 0 THEN 'applied' WHEN v_ok = 0 THEN 'failed' ELSE 'partial' END,
    v_results, v_pending, CASE WHEN jsonb_array_length(v_pending) > 0 THEN 'pending' ELSE 'none' END);
  RETURN v_results;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_button_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  BEGIN
    PERFORM fn_button_apply(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING '[button] message % failed: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $function$;
-- Nome depois de trg_cadence_on_inbound_message: a resposta encerra a régua antiga primeiro; depois o botão
-- pode inscrever numa nova, mover etapa etc.
DROP TRIGGER IF EXISTS trg_whatsapp_button_on_message ON public.messages;
CREATE TRIGGER trg_whatsapp_button_on_message AFTER INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound' AND NEW.metadata ? 'interactive_reply')
  EXECUTE FUNCTION public.fn_button_on_message();

-- Resposta pela régua: botão com "não conta como resposta" não encerra nem pausa a régua.
CREATE OR REPLACE FUNCTION public.fn_cadence_on_inbound_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_contact uuid;
  v_e record;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'inbound' OR coalesce(NEW.is_internal_note, false) OR NEW.thread_id IS NULL THEN RETURN NULL; END IF;
  BEGIN
    SELECT contact_id INTO v_contact FROM message_threads WHERE id = NEW.thread_id;
    IF v_contact IS NULL THEN RETURN NULL; END IF;
    IF NEW.metadata ? 'interactive_reply' AND EXISTS (
      SELECT 1 FROM fn_button_rule_for_message(NEW.organization_id, NEW.reply_to_message_id, NEW.metadata) r WHERE r.counts_as_reply = false) THEN
      RETURN NULL;
    END IF;
    FOR v_e IN
      SELECT e.id, c.on_reply FROM cadence_enrollments e JOIN cadences c ON c.id = e.cadence_id
      WHERE e.contact_id = v_contact AND e.status = 'active'
    LOOP
      UPDATE cadence_enrollments SET last_reply_at = now(), updated_at = now() WHERE id = v_e.id;
      IF v_e.on_reply = 'cancel' THEN
        PERFORM fn_cadence_end_enrollment(v_e.id, 'cancelled', 'o lead respondeu');
      ELSIF v_e.on_reply = 'pause' THEN
        UPDATE cadence_enrollments SET status = 'paused', paused_at = now(), updated_at = now() WHERE id = v_e.id;
      END IF;
    END LOOP;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[cadence] inbound message % trigger failed: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $function$;

-- Robô: reserva os envios de template pedidos por botões (cada evento uma vez; preso > 15 min vira falha).
CREATE OR REPLACE FUNCTION public.fn_button_claim_sends(p_limit integer DEFAULT 20)
RETURNS TABLE (event_id uuid, organization_id uuid, contact_id uuid, thread_id uuid, opportunity_id uuid, pending_sends jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  UPDATE whatsapp_button_events SET sends_status = 'failed', sends_result = jsonb_build_object('error', 'envio interrompido')
  WHERE sends_status = 'sending' AND sends_claimed_at < now() - interval '15 minutes';
  RETURN QUERY
  WITH due AS (
    SELECT id FROM whatsapp_button_events WHERE sends_status = 'pending' AND created_at > now() - interval '1 day'
    ORDER BY created_at LIMIT least(greatest(coalesce(p_limit, 20), 1), 100) FOR UPDATE SKIP LOCKED
  )
  UPDATE whatsapp_button_events ev SET sends_status = 'sending', sends_claimed_at = now()
  FROM due WHERE ev.id = due.id
  RETURNING ev.id, ev.organization_id, ev.contact_id, ev.thread_id, ev.opportunity_id, ev.pending_sends;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_button_finish_sends(p_event_id uuid, p_ok boolean, p_result jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  UPDATE whatsapp_button_events SET sends_status = CASE WHEN p_ok THEN 'done' ELSE 'failed' END, sends_result = p_result
  WHERE id = p_event_id AND sends_status = 'sending';
$function$;

REVOKE ALL ON FUNCTION public.fn_button_rule_for_message(uuid, uuid, jsonb), public.fn_button_apply(uuid),
  public.fn_button_on_message(), public.fn_button_rule_guard(), public.fn_button_claim_sends(integer),
  public.fn_button_finish_sends(uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_button_claim_sends(integer), public.fn_button_finish_sends(uuid, boolean, jsonb),
  public.fn_button_apply(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_button_key(text) TO authenticated, service_role;
