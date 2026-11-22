-- Réguas (cadências) — fase 2: régua mínima e robô de envio. Vale para todas as organizações.
--
-- cadences            : a régua (gatilho = entrar numa etapa ou inscrição manual; o que fazer quando o lead responde).
-- cadence_steps       : os passos (tempo desde a inscrição; template de WhatsApp ou tarefa; se é marketing).
-- cadence_enrollments : uma oportunidade numa régua (ativa, pausada, concluída, cancelada + motivo).
-- cadence_sends       : a fila de envios das réguas (um por passo de cada inscrição; o banco impede repetir).
-- organization_cadence_settings : janela de envio, fuso, limites e "pausar todas" da org.
--
-- O robô (edge function cadence-dispatch) reserva envios (fn_cadence_claim_sends), decide na hora do envio
-- (fn_cadence_prepare_send: não contatar, aceite, janela, limites, repetição) e registra o resultado
-- (fn_cadence_finish_send). Os gatilhos nunca derrubam a operação que os disparou (erro vira WARNING).

-- ============================== Tabelas ==============================

CREATE TABLE IF NOT EXISTS public.organization_cadence_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  timezone text,                                   -- null = fuso da organização
  -- Janela por dia da semana ISO (1 = segunda ... 7 = domingo): {"1": ["09:00","19:00"], ...}. Dia ausente = não envia.
  send_windows jsonb NOT NULL DEFAULT '{"1":["09:00","19:00"],"2":["09:00","19:00"],"3":["09:00","19:00"],"4":["09:00","19:00"],"5":["09:00","19:00"],"6":["09:00","13:00"]}'::jsonb,
  weekly_marketing_limit integer NOT NULL DEFAULT 2 CHECK (weekly_marketing_limit BETWEEN 0 AND 50),
  daily_send_limit integer NOT NULL DEFAULT 500 CHECK (daily_send_limit BETWEEN 0 AND 100000),
  paused boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cadences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  is_active boolean NOT NULL DEFAULT false,
  trigger_type text NOT NULL DEFAULT 'stage_entered' CHECK (trigger_type IN ('stage_entered', 'manual')),
  trigger_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  on_reply text NOT NULL DEFAULT 'cancel' CHECK (on_reply IN ('cancel', 'pause', 'continue')),
  exit_on_stage_change boolean NOT NULL DEFAULT true,
  send_windows jsonb,                              -- null = janela da org
  weekly_marketing_limit integer CHECK (weekly_marketing_limit BETWEEN 0 AND 50),  -- null = limite da org
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (trigger_type = 'manual' OR trigger_stage_id IS NOT NULL OR is_active = false)
);
CREATE INDEX IF NOT EXISTS idx_cadences_trigger ON public.cadences (organization_id, trigger_stage_id) WHERE is_active AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cadence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cadence_id uuid NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN 0 AND 525600),
  kind text NOT NULL CHECK (kind IN ('whatsapp_template', 'task')),
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  -- Variável do template → texto com marcadores ({{contact.first_name}}, {{custom.trilha}}...). Ver cadence-variables.ts.
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  task_title text,
  task_description text,
  task_due_minutes integer NOT NULL DEFAULT 60 CHECK (task_due_minutes BETWEEN 0 AND 525600),
  task_priority text NOT NULL DEFAULT 'medium' CHECK (task_priority IN ('low', 'medium', 'high')),
  is_marketing boolean NOT NULL DEFAULT false,
  ignore_send_window boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'task' OR length(trim(coalesce(task_title, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS idx_cadence_steps_cadence ON public.cadence_steps (cadence_id, position);

CREATE TABLE IF NOT EXISTS public.cadence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cadence_id uuid NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  source text NOT NULL DEFAULT 'stage' CHECK (source IN ('stage', 'manual')),
  enrolled_by uuid,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  last_reply_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Uma inscrição viva por oportunidade e régua.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cadence_enrollment_live ON public.cadence_enrollments (opportunity_id, cadence_id) WHERE status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_contact_live ON public.cadence_enrollments (contact_id) WHERE status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_opp ON public.cadence_enrollments (opportunity_id, enrolled_at DESC);

CREATE TABLE IF NOT EXISTS public.cadence_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.cadence_enrollments(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.cadence_steps(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  kind text NOT NULL,
  is_marketing boolean NOT NULL DEFAULT false,
  template_id uuid,                                 -- template usado (gravado no envio)
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  result_reason text,
  message_id uuid,
  task_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, step_id)
);
CREATE INDEX IF NOT EXISTS idx_cadence_sends_due ON public.cadence_sends (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cadence_sends_sending ON public.cadence_sends (claimed_at) WHERE status = 'sending';
CREATE INDEX IF NOT EXISTS idx_cadence_sends_contact_sent ON public.cadence_sends (contact_id, sent_at DESC) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_cadence_sends_org_sent ON public.cadence_sends (organization_id, sent_at DESC) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_cadence_sends_enrollment ON public.cadence_sends (enrollment_id, scheduled_at);

-- ============================== Segurança ==============================

ALTER TABLE public.organization_cadence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_sends ENABLE ROW LEVEL SECURITY;

-- Leitura: membros da org. Configuração (réguas, passos, janela): só administrador da org.
-- Inscrições e envios: só pelas funções (ninguém escreve direto).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organization_cadence_settings', 'cadences', 'cadence_steps', 'cadence_enrollments', 'cadence_sends'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Org members read %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Org members read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (user_has_org_access(organization_id))', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['organization_cadence_settings', 'cadences', 'cadence_steps'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Org admins write %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Org admins write %1$s" ON public.%1$I FOR ALL TO authenticated USING (is_org_system_admin(organization_id)) WITH CHECK (is_org_system_admin(organization_id))', t);
  END LOOP;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.cadence_enrollments, public.cadence_sends FROM authenticated;

-- Passo precisa ser da mesma org da régua; template, da mesma org.
CREATE OR REPLACE FUNCTION public.fn_cadence_step_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cadences c WHERE c.id = NEW.cadence_id AND c.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'cadence_org_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM whatsapp_templates w WHERE w.id = NEW.template_id AND w.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'template_org_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NEW.kind = 'whatsapp_template' AND NEW.template_id IS NULL THEN
    RAISE EXCEPTION 'template_required' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_cadence_step_guard ON public.cadence_steps;
CREATE TRIGGER trg_cadence_step_guard BEFORE INSERT OR UPDATE ON public.cadence_steps
  FOR EACH ROW EXECUTE FUNCTION public.fn_cadence_step_guard();

CREATE OR REPLACE FUNCTION public.fn_cadence_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.trigger_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages s WHERE s.id = NEW.trigger_stage_id AND s.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'stage_org_mismatch' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_cadence_guard ON public.cadences;
CREATE TRIGGER trg_cadence_guard BEFORE INSERT OR UPDATE ON public.cadences
  FOR EACH ROW EXECUTE FUNCTION public.fn_cadence_guard();

-- ============================== Janela de envio ==============================

-- Primeiro instante >= p_ts dentro da janela (no fuso p_tz). Janela vazia ou inválida = sem restrição.
CREATE OR REPLACE FUNCTION public.fn_cadence_window_at(p_ts timestamptz, p_windows jsonb, p_tz text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE
  v_local timestamp := p_ts AT TIME ZONE p_tz;
  v_day date;
  v_w jsonb;
  v_start timestamp;
  v_end timestamp;
BEGIN
  IF p_windows IS NULL OR jsonb_typeof(p_windows) <> 'object' THEN RETURN p_ts; END IF;
  FOR d IN 0..7 LOOP
    v_day := (v_local::date) + d;
    v_w := p_windows -> extract(isodow FROM v_day)::int::text;
    CONTINUE WHEN v_w IS NULL OR jsonb_typeof(v_w) <> 'array' OR jsonb_array_length(v_w) <> 2;
    BEGIN
      v_start := v_day + (v_w ->> 0)::time;
      v_end := v_day + (v_w ->> 1)::time;
    EXCEPTION WHEN others THEN CONTINUE;
    END;
    CONTINUE WHEN v_end <= v_start;
    IF v_local < v_end THEN
      RETURN greatest(v_local, v_start) AT TIME ZONE p_tz;
    END IF;
  END LOOP;
  RETURN p_ts; -- nenhum dia válido: não restringe
END $function$;

-- Janela, fuso e limite valendo para uma régua (régua > org > padrão).
CREATE OR REPLACE FUNCTION public.fn_cadence_rules(p_cadence_id uuid)
RETURNS TABLE (windows jsonb, tz text, weekly_limit integer, daily_limit integer, org_paused boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    coalesce(c.send_windows, s.send_windows, '{"1":["09:00","19:00"],"2":["09:00","19:00"],"3":["09:00","19:00"],"4":["09:00","19:00"],"5":["09:00","19:00"],"6":["09:00","13:00"]}'::jsonb),
    coalesce(nullif(s.timezone, ''), nullif(o.timezone, ''), 'America/Sao_Paulo'),
    coalesce(c.weekly_marketing_limit, s.weekly_marketing_limit, 2),
    coalesce(s.daily_send_limit, 500),
    coalesce(s.paused, false)
  FROM cadences c
  JOIN organizations o ON o.id = c.organization_id
  LEFT JOIN organization_cadence_settings s ON s.organization_id = c.organization_id
  WHERE c.id = p_cadence_id;
$function$;

-- ============================== Inscrição e saída ==============================

CREATE OR REPLACE FUNCTION public.fn_cadence_end_enrollment(p_enrollment_id uuid, p_status text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  UPDATE cadence_enrollments SET status = p_status, ended_at = now(), end_reason = left(p_reason, 120), updated_at = now()
  WHERE id = p_enrollment_id AND status IN ('active', 'paused');
  IF FOUND THEN
    UPDATE cadence_sends SET status = 'cancelled', result_reason = left(p_reason, 120), updated_at = now()
    WHERE enrollment_id = p_enrollment_id AND status = 'pending';
  END IF;
END $function$;

-- Inscreve a oportunidade na régua e agenda todos os passos. Uma régua por vez: as outras vivas são canceladas.
-- Já inscrita nesta régua = devolve a inscrição existente.
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
    v_at := now() + make_interval(mins => v_step.delay_minutes);
    IF NOT v_step.ignore_send_window THEN v_at := fn_cadence_window_at(v_at, v_rules.windows, v_rules.tz); END IF;
    INSERT INTO cadence_sends (organization_id, enrollment_id, step_id, contact_id, opportunity_id, kind, is_marketing, template_id, scheduled_at)
    VALUES (v_cad.organization_id, v_id, v_step.id, v_opp.contact_id, p_opportunity_id, v_step.kind, v_step.is_marketing, v_step.template_id, v_at);
  END LOOP;
  RETURN v_id;
END $function$;

-- ============================== Gatilhos ==============================

-- Oportunidade: ganha/perdida/excluída encerra; mudou de etapa sai das réguas da etapa anterior e entra nas da nova.
CREATE OR REPLACE FUNCTION public.fn_cadence_on_opportunity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_e record;
  v_c record;
  v_stage_changed boolean := TG_OP = 'INSERT' OR NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id;
BEGIN
  BEGIN
    IF NEW.deleted_at IS NOT NULL OR NEW.status IN ('won', 'lost') THEN
      FOR v_e IN SELECT id FROM cadence_enrollments WHERE opportunity_id = NEW.id AND status IN ('active', 'paused') LOOP
        PERFORM fn_cadence_end_enrollment(v_e.id, 'cancelled',
          CASE WHEN NEW.deleted_at IS NOT NULL THEN 'oportunidade excluída' WHEN NEW.status = 'won' THEN 'oportunidade ganha' ELSE 'oportunidade perdida' END);
      END LOOP;
      RETURN NULL;
    END IF;
    IF NOT v_stage_changed THEN RETURN NULL; END IF;

    FOR v_e IN
      SELECT e.id FROM cadence_enrollments e JOIN cadences c ON c.id = e.cadence_id
      WHERE e.opportunity_id = NEW.id AND e.status IN ('active', 'paused')
        AND c.exit_on_stage_change AND c.trigger_stage_id IS DISTINCT FROM NEW.pipeline_stage_id
    LOOP
      PERFORM fn_cadence_end_enrollment(v_e.id, 'cancelled', 'mudou de etapa');
    END LOOP;

    IF NEW.status = 'open' AND NEW.pipeline_stage_id IS NOT NULL THEN
      FOR v_c IN
        SELECT id FROM cadences
        WHERE organization_id = NEW.organization_id AND trigger_stage_id = NEW.pipeline_stage_id
          AND trigger_type = 'stage_entered' AND is_active AND deleted_at IS NULL
        ORDER BY created_at LIMIT 1
      LOOP
        PERFORM fn_cadence_enroll(v_c.id, NEW.id, 'stage', NULL);
      END LOOP;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[cadence] opportunity % trigger failed: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS trg_cadence_on_opportunity ON public.opportunities;
CREATE TRIGGER trg_cadence_on_opportunity AFTER INSERT OR UPDATE OF pipeline_stage_id, status, deleted_at ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_cadence_on_opportunity();

-- Mensagem do lead: conforme a régua, cancela, pausa ou só registra a resposta.
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
DROP TRIGGER IF EXISTS trg_cadence_on_inbound_message ON public.messages;
CREATE TRIGGER trg_cadence_on_inbound_message AFTER INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound') EXECUTE FUNCTION public.fn_cadence_on_inbound_message();

-- Contato com "não contatar" (ou excluído) sai de todas as réguas.
CREATE OR REPLACE FUNCTION public.fn_cadence_on_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_e record;
BEGIN
  IF NOT ((NEW.do_not_contact IS TRUE AND OLD.do_not_contact IS NOT TRUE) OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)) THEN
    RETURN NULL;
  END IF;
  BEGIN
    FOR v_e IN SELECT id FROM cadence_enrollments WHERE contact_id = NEW.id AND status IN ('active', 'paused') LOOP
      PERFORM fn_cadence_end_enrollment(v_e.id, 'cancelled', CASE WHEN NEW.deleted_at IS NOT NULL THEN 'contato excluído' ELSE 'não contatar' END);
    END LOOP;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[cadence] contact % trigger failed: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS trg_cadence_on_contact ON public.contacts;
CREATE TRIGGER trg_cadence_on_contact AFTER UPDATE OF do_not_contact, deleted_at ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.fn_cadence_on_contact();

-- Régua desligada ou excluída: cancela as inscrições vivas e os envios pendentes.
CREATE OR REPLACE FUNCTION public.fn_cadence_on_cadence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_e record;
BEGIN
  IF (NEW.is_active AND NEW.deleted_at IS NULL) OR (NOT OLD.is_active AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL) THEN RETURN NULL; END IF;
  FOR v_e IN SELECT id FROM cadence_enrollments WHERE cadence_id = NEW.id AND status IN ('active', 'paused') LOOP
    PERFORM fn_cadence_end_enrollment(v_e.id, 'cancelled', CASE WHEN NEW.deleted_at IS NOT NULL THEN 'régua excluída' ELSE 'régua desligada' END);
  END LOOP;
  RETURN NULL;
END $function$;
DROP TRIGGER IF EXISTS trg_cadence_on_cadence ON public.cadences;
CREATE TRIGGER trg_cadence_on_cadence AFTER UPDATE OF is_active, deleted_at ON public.cadences
  FOR EACH ROW EXECUTE FUNCTION public.fn_cadence_on_cadence();

-- ============================== Robô de envio ==============================

-- Reserva os envios vencidos (cada um só uma vez). Envio preso em "enviando" há mais de 15 min vira falha
-- (não reenvia: na dúvida, não manda duas vezes).
CREATE OR REPLACE FUNCTION public.fn_cadence_claim_sends(p_limit integer DEFAULT 50)
RETURNS TABLE (send_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  UPDATE cadence_sends SET status = 'failed', result_reason = 'envio interrompido (não reenviado para não duplicar)', updated_at = now()
  WHERE status = 'sending' AND claimed_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH due AS (
    SELECT s.id FROM cadence_sends s
    JOIN cadence_enrollments e ON e.id = s.enrollment_id AND e.status = 'active'
    JOIN cadences c ON c.id = e.cadence_id AND c.is_active AND c.deleted_at IS NULL
    LEFT JOIN organization_cadence_settings os ON os.organization_id = s.organization_id
    WHERE s.status = 'pending' AND s.scheduled_at <= now() AND coalesce(os.paused, false) = false
    ORDER BY s.scheduled_at
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    FOR UPDATE OF s SKIP LOCKED
  )
  UPDATE cadence_sends s SET status = 'sending', claimed_at = now(), attempts = s.attempts + 1, updated_at = now()
  FROM due WHERE s.id = due.id
  RETURNING s.id;
END $function$;

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

  -- Número: linha comercial de WhatsApp da org. Conversa: a última dessa linha com o contato (se houver).
  SELECT l.active_endpoint_id INTO v_endpoint FROM messaging_lines l
  JOIN communication_endpoints ce ON ce.id = l.active_endpoint_id AND ce.is_active
  WHERE l.organization_id = s.organization_id AND l.key = 'commercial' AND l.channel = 'whatsapp'
  LIMIT 1;
  IF v_endpoint IS NULL THEN
    UPDATE cadence_sends SET status = 'failed', result_reason = 'organização sem número de WhatsApp comercial ativo', updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('action', 'failed', 'reason', 'organização sem número de WhatsApp comercial ativo');
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

-- Resultado do envio. Sem mais nada pendente, a inscrição fica concluída.
CREATE OR REPLACE FUNCTION public.fn_cadence_finish_send(p_send_id uuid, p_status text, p_reason text DEFAULT NULL, p_message_id uuid DEFAULT NULL, p_task_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_enrollment uuid;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023'; END IF;
  UPDATE cadence_sends SET status = p_status, result_reason = left(p_reason, 300),
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
    message_id = coalesce(p_message_id, message_id), task_id = coalesce(p_task_id, task_id), updated_at = now()
  WHERE id = p_send_id AND status = 'sending'
  RETURNING enrollment_id INTO v_enrollment;
  IF v_enrollment IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cadence_sends WHERE enrollment_id = v_enrollment AND status IN ('pending', 'sending')) THEN
    UPDATE cadence_enrollments SET status = 'completed', ended_at = now(), end_reason = 'todos os passos concluídos', updated_at = now()
    WHERE id = v_enrollment AND status = 'active';
  END IF;
END $function$;

-- ============================== Ações do usuário ==============================

CREATE OR REPLACE FUNCTION public.rpc_cadence_enroll_v1(p_opportunity_id uuid, p_cadence_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT organization_id INTO v_org FROM cadences WHERE id = p_cadence_id AND deleted_at IS NULL;
  IF v_org IS NULL OR NOT (v_org = ANY (current_user_org_ids())) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_id := fn_cadence_enroll(p_cadence_id, p_opportunity_id, 'manual', current_user_id());
  RETURN jsonb_build_object('ok', true, 'enrollment_id', v_id);
END $function$;

-- pause | resume | cancel. Ao retomar, os envios pendentes andam o tempo que a inscrição ficou pausada.
CREATE OR REPLACE FUNCTION public.rpc_cadence_enrollment_action_v1(p_enrollment_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE e cadence_enrollments%ROWTYPE; r record; v_shift interval;
BEGIN
  SELECT * INTO e FROM cadence_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF e.id IS NULL OR NOT (e.organization_id = ANY (current_user_org_ids())) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_action = 'pause' AND e.status = 'active' THEN
    UPDATE cadence_enrollments SET status = 'paused', paused_at = now(), updated_at = now() WHERE id = e.id;
  ELSIF p_action = 'resume' AND e.status = 'paused' THEN
    v_shift := now() - coalesce(e.paused_at, now());
    SELECT * INTO r FROM fn_cadence_rules(e.cadence_id);
    UPDATE cadence_sends cs SET scheduled_at = CASE WHEN st.ignore_send_window THEN greatest(cs.scheduled_at + v_shift, now())
        ELSE fn_cadence_window_at(greatest(cs.scheduled_at + v_shift, now()), r.windows, r.tz) END, updated_at = now()
    FROM cadence_steps st WHERE cs.enrollment_id = e.id AND cs.status = 'pending' AND st.id = cs.step_id;
    UPDATE cadence_enrollments SET status = 'active', paused_at = NULL, updated_at = now() WHERE id = e.id;
  ELSIF p_action = 'cancel' AND e.status IN ('active', 'paused') THEN
    PERFORM fn_cadence_end_enrollment(e.id, 'cancelled', 'cancelada por um usuário');
  ELSIF p_action NOT IN ('pause', 'resume', 'cancel') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- ============================== Permissões das funções ==============================

REVOKE ALL ON FUNCTION public.fn_cadence_window_at(timestamptz, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cadence_window_at(timestamptz, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_cadence_rules(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cadence_end_enrollment(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cadence_enroll(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cadence_claim_sends(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cadence_prepare_send(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cadence_finish_send(uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cadence_rules(uuid), public.fn_cadence_end_enrollment(uuid, text, text),
  public.fn_cadence_enroll(uuid, uuid, text, uuid), public.fn_cadence_claim_sends(integer),
  public.fn_cadence_prepare_send(uuid), public.fn_cadence_finish_send(uuid, text, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rpc_cadence_enroll_v1(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cadence_enrollment_action_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cadence_enroll_v1(uuid, uuid), public.rpc_cadence_enrollment_action_v1(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cadence_on_opportunity(), public.fn_cadence_on_inbound_message(),
  public.fn_cadence_on_contact(), public.fn_cadence_on_cadence(), public.fn_cadence_guard(), public.fn_cadence_step_guard() FROM PUBLIC, anon, authenticated;
