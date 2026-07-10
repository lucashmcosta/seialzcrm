-- ============================================================================
-- Webchat v1 — quarentena de sessões + promoção para lead
-- ============================================================================
-- Canal próprio de captação (hedge de WhatsApp/Meta). Widget = communication_
-- endpoint com channel='webchat'. Visitante vive em quarentena (webchat_sessions
-- + webchat_session_messages) e SÓ vira contact/opportunity/thread depois de
-- qualificado (nome + telefone). Nada de anon nas policies: todo acesso de
-- visitante passa por edge function (service_role) após validar token.
-- Sem OTP no v1 (telefone validado localmente; phone_verified=false).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Habilita o canal 'webchat' e o provider 'seialz' em communication_endpoints
--    (aditivo — só amplia os CHECK existentes; widget = endpoint webchat).
-- ---------------------------------------------------------------------------
ALTER TABLE public.communication_endpoints DROP CONSTRAINT IF EXISTS communication_endpoints_channel_check;
ALTER TABLE public.communication_endpoints ADD CONSTRAINT communication_endpoints_channel_check
  CHECK (channel = ANY (ARRAY['whatsapp'::text, 'voice'::text, 'sms'::text, 'email'::text, 'webchat'::text, 'other'::text]));

ALTER TABLE public.communication_endpoints DROP CONSTRAINT IF EXISTS communication_endpoints_provider_check;
ALTER TABLE public.communication_endpoints ADD CONSTRAINT communication_endpoints_provider_check
  CHECK ((provider IS NULL) OR (provider = ANY (ARRAY['twilio'::text, 'meta_cloud_api'::text, 'meta_cloud_api_coexistence'::text, '360dialog'::text, 'seialz'::text, 'other'::text])));

-- ---------------------------------------------------------------------------
-- 1. Sessões (quarentena)
-- ---------------------------------------------------------------------------
CREATE TABLE public.webchat_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id),
  endpoint_id      uuid NOT NULL REFERENCES public.communication_endpoints(id),
  contact_id       uuid REFERENCES public.contacts(id),         -- preenchido na promoção
  thread_id        uuid REFERENCES public.message_threads(id),  -- idem
  token_hash       text NOT NULL UNIQUE,                        -- sha256; visitante guarda o claro
  status           text NOT NULL DEFAULT 'active',              -- active|qualified|promoted|expired|blocked
  flow_state       jsonb NOT NULL DEFAULT '{}'::jsonb,          -- posição no roteiro + { collected: {...} }
  visitor_name     text,
  visitor_phone    text,                                        -- como digitado
  phone_verified   boolean NOT NULL DEFAULT false,
  landing_url      text,
  referrer         text,
  utm              jsonb NOT NULL DEFAULT '{}'::jsonb,
  fbclid           text,
  fbc              text,
  fbp              text,
  ip               inet,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  promoted_at      timestamptz,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

GRANT SELECT ON public.webchat_sessions TO authenticated;
GRANT ALL ON public.webchat_sessions TO service_role;

ALTER TABLE public.webchat_sessions ENABLE ROW LEVEL SECURITY;

-- Membros da org LEEM (inbox/métricas). Escrita de visitante é só via edge (service_role).
CREATE POLICY "org members read webchat sessions"
  ON public.webchat_sessions FOR SELECT
  TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

CREATE INDEX idx_webchat_sessions_org_created
  ON public.webchat_sessions (organization_id, created_at DESC);
CREATE INDEX idx_webchat_sessions_endpoint_status
  ON public.webchat_sessions (endpoint_id, status);
CREATE INDEX idx_webchat_sessions_expiry
  ON public.webchat_sessions (expires_at)
  WHERE status IN ('active', 'qualified');

CREATE TRIGGER update_webchat_sessions_updated_at
  BEFORE UPDATE ON public.webchat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Mensagens em quarentena (antes da promoção NÃO entram em public.messages)
-- ---------------------------------------------------------------------------
CREATE TABLE public.webchat_session_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id),
  session_id       uuid NOT NULL REFERENCES public.webchat_sessions(id) ON DELETE CASCADE,
  role             text NOT NULL,                               -- visitor|bot|system  (engine-agnóstico)
  content          text NOT NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,          -- botão clicado, step do fluxo, etc.
  created_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webchat_session_messages TO authenticated;
GRANT ALL ON public.webchat_session_messages TO service_role;

ALTER TABLE public.webchat_session_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read webchat session messages"
  ON public.webchat_session_messages FOR SELECT
  TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

CREATE INDEX idx_webchat_session_messages_session
  ON public.webchat_session_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Promoção: sessão qualificada -> contact + opportunity + thread + transcript
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, uma transação. Reusa a máquina existente:
--   * normalize_phone_br() + dedupe por phone_normalized na org
--   * triggers de round-robin (contacts/opportunities) atribuem owner sozinhas
--   * triggers de CAPI (fn_capi_trigger_lead_on_contact) e outbox
--     (fn_publish_integration_event) disparam sozinhas no insert — NÃO
--     disparamos CAPI manualmente aqui (evita Lead duplicado).
-- Idempotente: sessão já 'promoted' devolve o thread_id existente.
CREATE OR REPLACE FUNCTION public.promote_session_to_contact(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session      webchat_sessions%ROWTYPE;
  v_endpoint     communication_endpoints%ROWTYPE;
  v_settings     jsonb;
  v_stage_id     uuid;
  v_phone_norm   text;
  v_phone_digits text;
  v_business_ctx text;
  v_contact_id   uuid;
  v_thread_id    uuid;
  v_name         text;
  v_msg          RECORD;
BEGIN
  SELECT * INTO v_session FROM webchat_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'webchat session % not found', p_session_id;
  END IF;

  -- Idempotência: já promovida
  IF v_session.status = 'promoted' AND v_session.thread_id IS NOT NULL THEN
    RETURN v_session.thread_id;
  END IF;

  IF v_session.visitor_phone IS NULL OR length(trim(v_session.visitor_phone)) = 0 THEN
    RAISE EXCEPTION 'cannot promote session % without phone', p_session_id;
  END IF;

  SELECT * INTO v_endpoint FROM communication_endpoints WHERE id = v_session.endpoint_id;
  v_settings := COALESCE(v_endpoint.inbound_settings, '{}'::jsonb);
  v_stage_id := NULLIF(v_settings #>> '{target,pipeline_stage_id}', '')::uuid;
  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'webchat endpoint % has no target.pipeline_stage_id configured', v_endpoint.id;
  END IF;

  -- Webchat é captação comercial; deriva do purpose do endpoint como o resto do sistema.
  v_business_ctx := CASE WHEN v_endpoint.purpose = 'customer_service' THEN 'customer_service' ELSE 'sales' END;

  -- Canoniza para a forma BR com DDI (55) ANTES de deduplicar: o visitante do
  -- webchat digita sem código do país, e normalize_phone_br() só é canônico
  -- quando o 55 já está presente. Sem isso, "(11) 9xxxx-xxxx" não bateria com
  -- o mesmo número vindo do WhatsApp (que sempre chega com 55).
  v_phone_digits := regexp_replace(v_session.visitor_phone, '\D', '', 'g');
  IF length(v_phone_digits) IN (10, 11) THEN
    v_phone_digits := '55' || v_phone_digits;
  END IF;
  v_phone_norm := normalize_phone_br(v_phone_digits);
  v_name := COALESCE(NULLIF(trim(v_session.visitor_name), ''), 'Lead Webchat');

  -- 1) Dedupe de contact por telefone normalizado na org
  SELECT id INTO v_contact_id
  FROM contacts
  WHERE organization_id = v_session.organization_id
    AND phone_normalized = v_phone_norm
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    -- grava o telefone já canonizado (com 55) para o phone_normalized do contato
    -- ficar consistente com o dedup e com os leads do WhatsApp.
    INSERT INTO contacts (organization_id, full_name, phone, source, source_external_id,
                          utm_source, utm_content)
    VALUES (v_session.organization_id, v_name, v_phone_norm, 'webchat',
            v_session.id::text,
            NULLIF(v_session.utm #>> '{utm_source}', ''),
            NULLIF(v_session.utm #>> '{utm_content}', ''))
    RETURNING id INTO v_contact_id;
    -- trigger contacts_set_phone_normalized: phone_normalized
    -- trigger contacts_round_robin: owner_user_id
    -- trigger fn_capi_trigger_lead_on_contact: CAPI Lead
    -- trigger fn_publish_integration_event: outbox contact.created
  END IF;

  -- 2) Opportunity no stage-alvo (trigger opportunities_round_robin atribui owner)
  INSERT INTO opportunities (organization_id, title, pipeline_stage_id, contact_id, source,
                             source_external_id, utm_source, utm_content)
  VALUES (v_session.organization_id, v_name, v_stage_id, v_contact_id, 'webchat',
          v_session.id::text,
          NULLIF(v_session.utm #>> '{utm_source}', ''),
          NULLIF(v_session.utm #>> '{utm_content}', ''));

  -- 3) Thread do webchat — reusa a aberta existente do mesmo contato+endpoint
  -- (índice único message_threads_unique_open_per_contact_endpoint); se o
  -- visitante voltar pelo mesmo widget, continua na thread dele.
  SELECT id INTO v_thread_id
  FROM message_threads
  WHERE organization_id = v_session.organization_id
    AND contact_id = v_contact_id
    AND channel = 'webchat'
    AND primary_endpoint_id = v_endpoint.id
    AND status = ANY (ARRAY['open', 'awaiting_client', 'in_progress'])
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    INSERT INTO message_threads (organization_id, contact_id, channel, primary_endpoint_id,
                                 status, business_context)
    VALUES (v_session.organization_id, v_contact_id, 'webchat', v_endpoint.id, 'open', v_business_ctx)
    RETURNING id INTO v_thread_id;
  END IF;

  -- 4) Transplanta o transcript da quarentena -> messages (ordem cronológica)
  FOR v_msg IN
    SELECT role, content, created_at
    FROM webchat_session_messages
    WHERE session_id = v_session.id
    ORDER BY created_at ASC
  LOOP
    -- media_type fica NULL para texto (CHECK só aceita image/audio/video/document/sticker)
    INSERT INTO messages (organization_id, thread_id, content, direction, sender_type,
                          sender_name, endpoint_id)
    VALUES (
      v_session.organization_id, v_thread_id, v_msg.content,
      CASE WHEN v_msg.role = 'visitor' THEN 'inbound' ELSE 'outbound' END,
      CASE WHEN v_msg.role = 'visitor' THEN 'contact'
           WHEN v_msg.role = 'bot'     THEN 'agent'
           ELSE 'system' END,
      CASE WHEN v_msg.role = 'visitor' THEN v_name ELSE COALESCE(v_endpoint.display_name, 'Webchat') END,
      v_endpoint.id
    );
  END LOOP;

  -- 5) Marca a sessão como promovida
  UPDATE webchat_sessions
  SET status = 'promoted', contact_id = v_contact_id, thread_id = v_thread_id, promoted_at = now()
  WHERE id = v_session.id;

  RETURN v_thread_id;
END;
$function$;

COMMENT ON FUNCTION public.promote_session_to_contact(uuid) IS
  'Webchat: promove sessão qualificada a contact+opportunity+thread+transcript numa transação. Dedupe por phone_normalized; round-robin/CAPI/outbox disparam por trigger (NÃO disparar CAPI manualmente). Idempotente. Ver docs/plans/2026-07-webchat-v1.md.';
