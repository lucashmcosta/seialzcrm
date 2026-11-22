-- Réguas — fase 4: e-mail pela conta Resend da própria organização. Vale para todas as orgs.
--
-- organization_email_settings : conexão (status, remetente, domínio, marca, rodapé). Sem segredos.
-- organization_email_secrets  : chave da API e segredo do aviso de retorno, criptografados. Só o servidor lê.
-- email_templates             : modelos (assunto + corpo com marcadores {{contact.first_name}} etc.).
-- email_messages              : cada e-mail enviado e o que aconteceu com ele (entregue, aberto, devolvido...).
-- contacts.email_invalid_at   : e-mail devolvido de vez ou marcado como spam → não recebe mais nada.
-- Réguas ganham o passo 'email'.

CREATE TABLE IF NOT EXISTS public.organization_email_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'error', 'disconnected')),
  key_last4 text,
  webhook_id text,
  domain_id text,
  domain_name text,
  domain_status text,
  from_name text,
  from_email text,
  reply_to text,
  brand_color text CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text,
  footer_text text,
  last_error text,
  connected_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_email_secrets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key_encrypted text NOT NULL,
  webhook_secret_encrypted text,
  webhook_token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  subject text NOT NULL CHECK (length(trim(subject)) > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  is_marketing boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_templates_org ON public.email_templates (organization_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  cadence_send_id uuid REFERENCES public.cadence_sends(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  is_marketing boolean NOT NULL DEFAULT false,
  provider_message_id text UNIQUE,
  unsubscribe_token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed')),
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_contact ON public.email_messages (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_org ON public.email_messages (organization_id, created_at DESC);

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_invalid_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_invalid_reason text;

ALTER TABLE public.organization_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_email_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read organization_email_settings" ON public.organization_email_settings;
CREATE POLICY "Org members read organization_email_settings" ON public.organization_email_settings
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
-- Marca e rodapé o administrador edita direto; conexão, chave e domínio só pela função email-settings.
DROP POLICY IF EXISTS "Org admins update organization_email_settings" ON public.organization_email_settings;
CREATE POLICY "Org admins update organization_email_settings" ON public.organization_email_settings
  FOR UPDATE TO authenticated USING (is_org_system_admin(organization_id)) WITH CHECK (is_org_system_admin(organization_id));
REVOKE INSERT, DELETE ON public.organization_email_settings FROM authenticated;
REVOKE UPDATE ON public.organization_email_settings FROM authenticated;
GRANT UPDATE (from_name, reply_to, brand_color, logo_url, footer_text, updated_by, updated_at) ON public.organization_email_settings TO authenticated;

REVOKE ALL ON public.organization_email_secrets FROM authenticated, anon;

DROP POLICY IF EXISTS "Org members read email_templates" ON public.email_templates;
CREATE POLICY "Org members read email_templates" ON public.email_templates
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
DROP POLICY IF EXISTS "Org admins write email_templates" ON public.email_templates;
CREATE POLICY "Org admins write email_templates" ON public.email_templates
  FOR ALL TO authenticated USING (is_org_system_admin(organization_id)) WITH CHECK (is_org_system_admin(organization_id));

DROP POLICY IF EXISTS "Org members read email_messages" ON public.email_messages;
CREATE POLICY "Org members read email_messages" ON public.email_messages
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
REVOKE INSERT, UPDATE, DELETE ON public.email_messages FROM authenticated;
REVOKE ALL ON public.organization_email_settings, public.email_templates, public.email_messages FROM anon;

-- ============================== Passo de e-mail nas réguas ==============================

ALTER TABLE public.cadence_steps ADD COLUMN IF NOT EXISTS email_template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL;
ALTER TABLE public.cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_kind_check;
ALTER TABLE public.cadence_steps ADD CONSTRAINT cadence_steps_kind_check CHECK (kind IN ('whatsapp_template', 'task', 'email'));

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
  IF NEW.email_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM email_templates t WHERE t.id = NEW.email_template_id AND t.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'email_template_org_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NEW.kind = 'whatsapp_template' AND NEW.template_id IS NULL THEN
    RAISE EXCEPTION 'template_required' USING ERRCODE = '22023';
  END IF;
  IF NEW.kind = 'email' AND NEW.email_template_id IS NULL THEN
    RAISE EXCEPTION 'email_template_required' USING ERRCODE = '22023';
  END IF;
  -- Passo de e-mail é marketing se o modelo for de marketing.
  IF NEW.kind = 'email' THEN
    NEW.is_marketing := coalesce((SELECT is_marketing FROM email_templates WHERE id = NEW.email_template_id), NEW.is_marketing);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- ============================== Decisão do envio (com e-mail) ==============================
-- Mesma função da fase 2 (com o número pelo provedor do template), mais o ramo de e-mail.
-- O limite diário da org passa a contar WhatsApp + e-mail das réguas; o semanal de marketing já contava todos.
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

-- ============================== Retorno do provedor ==============================
-- Aplica um evento da Resend ao e-mail. Devolvido de vez ou spam: e-mail do contato inválido; spam também
-- revoga o aceite de marketing por e-mail. Entrada na linha do tempo para devolução e spam.
CREATE OR REPLACE FUNCTION public.fn_email_apply_event(p_org uuid, p_provider_id text, p_type text, p_detail text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m email_messages%ROWTYPE; v_rank_old int; v_rank_new int;
BEGIN
  SELECT * INTO m FROM email_messages WHERE organization_id = p_org AND provider_message_id = p_provider_id FOR UPDATE;
  IF m.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_message'); END IF;
  -- Status só avança (aberto não volta para entregue); devolução e spam sempre valem.
  v_rank_old := array_position(ARRAY['queued','failed','sent','delivered','opened','clicked','bounced','complained'], m.status);
  v_rank_new := array_position(ARRAY['queued','failed','sent','delivered','opened','clicked','bounced','complained'],
    CASE p_type WHEN 'email.delivered' THEN 'delivered' WHEN 'email.opened' THEN 'opened' WHEN 'email.clicked' THEN 'clicked'
      WHEN 'email.bounced' THEN 'bounced' WHEN 'email.complained' THEN 'complained' WHEN 'email.failed' THEN 'failed' ELSE NULL END);
  UPDATE email_messages SET
    status = CASE WHEN v_rank_new IS NOT NULL AND v_rank_new > coalesce(v_rank_old, 0)
      THEN (ARRAY['queued','failed','sent','delivered','opened','clicked','bounced','complained'])[v_rank_new] ELSE status END,
    delivered_at = CASE WHEN p_type = 'email.delivered' THEN coalesce(delivered_at, now()) ELSE delivered_at END,
    opened_at = CASE WHEN p_type = 'email.opened' THEN coalesce(opened_at, now()) ELSE opened_at END,
    clicked_at = CASE WHEN p_type = 'email.clicked' THEN coalesce(clicked_at, now()) ELSE clicked_at END,
    bounced_at = CASE WHEN p_type = 'email.bounced' THEN coalesce(bounced_at, now()) ELSE bounced_at END,
    complained_at = CASE WHEN p_type = 'email.complained' THEN coalesce(complained_at, now()) ELSE complained_at END,
    error = CASE WHEN p_type IN ('email.bounced', 'email.failed') THEN left(coalesce(p_detail, error), 300) ELSE error END
  WHERE id = m.id;

  IF m.contact_id IS NOT NULL AND (
       (p_type = 'email.bounced' AND coalesce(p_detail, '') NOT ILIKE '%transient%' AND coalesce(p_detail, '') NOT ILIKE '%temporar%')
       OR p_type = 'email.complained') THEN
    UPDATE contacts SET email_invalid_at = coalesce(email_invalid_at, now()),
      email_invalid_reason = CASE WHEN p_type = 'email.complained' THEN 'marcado como spam' ELSE 'devolvido' END
    WHERE id = m.contact_id AND email = m.to_email;
    IF p_type = 'email.complained' THEN
      PERFORM rpc_set_contact_consent_v1(m.contact_id, 'email', false, 'unsubscribe_link', 'marcou como spam');
    END IF;
    INSERT INTO activities (organization_id, contact_id, opportunity_id, activity_type, title, body, occurred_at)
    VALUES (m.organization_id, m.contact_id, m.opportunity_id, 'system',
      CASE WHEN p_type = 'email.complained' THEN 'E-mail marcado como spam' ELSE 'E-mail devolvido' END,
      left(m.subject || coalesce(' — ' || p_detail, ''), 500), now());
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- Descadastro pelo link do e-mail (token do próprio e-mail). Revoga o aceite de marketing por e-mail.
CREATE OR REPLACE FUNCTION public.fn_email_unsubscribe(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE m email_messages%ROWTYPE;
BEGIN
  SELECT * INTO m FROM email_messages WHERE unsubscribe_token = p_token;
  IF m.id IS NULL OR m.contact_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF m.unsubscribed_at IS NULL THEN
    UPDATE email_messages SET unsubscribed_at = now() WHERE id = m.id;
    PERFORM rpc_set_contact_consent_v1(m.contact_id, 'email', false, 'unsubscribe_link', 'link do e-mail');
    INSERT INTO activities (organization_id, contact_id, opportunity_id, activity_type, title, body, occurred_at)
    VALUES (m.organization_id, m.contact_id, m.opportunity_id, 'system', 'Descadastrou do e-mail de marketing', left(m.subject, 300), now());
  END IF;
  RETURN jsonb_build_object('ok', true, 'organization_id', m.organization_id);
END $function$;

REVOKE ALL ON FUNCTION public.fn_email_apply_event(uuid, text, text, text), public.fn_email_unsubscribe(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_apply_event(uuid, text, text, text), public.fn_email_unsubscribe(text) TO service_role;
