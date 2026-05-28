
-- ============================================================================
-- Onda 2b — Migration 1: communication_endpoints
-- ============================================================================

-- 1) Tabela base
CREATE TABLE IF NOT EXISTS public.communication_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_integration_id UUID NULL REFERENCES public.organization_integrations(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','voice','sms','email','other')),
  external_account_id TEXT NULL,           -- Twilio AccountSid (ACxxxx) ou equivalente
  sender_sid TEXT NULL,                    -- Twilio sender SID (XExxxx / MGxxxx)
  external_address TEXT NULL,              -- E.164: +14155238886
  display_name TEXT NULL,
  default_context_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (default_context_type IN ('sales','support','post_sale','marketing','mixed','unknown')),
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('online','offline','pending','disabled','unknown')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicidade (parcial p/ tolerar nulls)
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_endpoints_org_channel_address
  ON public.communication_endpoints (organization_id, channel, external_address)
  WHERE external_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_endpoints_org_sender_sid
  ON public.communication_endpoints (organization_id, sender_sid)
  WHERE sender_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_endpoints_org_channel
  ON public.communication_endpoints (organization_id, channel) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_comm_endpoints_integration
  ON public.communication_endpoints (organization_integration_id);

-- 2) GRANTs
GRANT SELECT ON public.communication_endpoints TO authenticated;
GRANT ALL ON public.communication_endpoints TO service_role;

-- 3) RLS
ALTER TABLE public.communication_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_endpoints_select_org_members"
  ON public.communication_endpoints
  FOR SELECT
  TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));

CREATE POLICY "comm_endpoints_service_role_all"
  ON public.communication_endpoints
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4) updated_at trigger
CREATE TRIGGER trg_comm_endpoints_updated_at
  BEFORE UPDATE ON public.communication_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Função de population a partir de v2_senders / available_numbers
CREATE OR REPLACE FUNCTION public.populate_communication_endpoints_from_v2_senders()
RETURNS TABLE(inserted INT, updated INT, scanned_integrations INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
  v_scanned INT := 0;
  r RECORD;
  s JSONB;
  v_addr TEXT;
  v_channel TEXT;
  v_account_sid TEXT;
BEGIN
  FOR r IN
    SELECT oi.id AS oi_id, oi.organization_id, oi.config_values, ai.slug
      FROM public.organization_integrations oi
      JOIN public.admin_integrations ai ON ai.id = oi.integration_id
     WHERE ai.slug IN ('twilio-whatsapp','twilio-voice','twilio-sms')
       AND oi.is_enabled = true
  LOOP
    v_scanned := v_scanned + 1;
    v_channel := CASE
      WHEN r.slug = 'twilio-whatsapp' THEN 'whatsapp'
      WHEN r.slug = 'twilio-voice' THEN 'voice'
      WHEN r.slug = 'twilio-sms' THEN 'sms'
      ELSE 'other'
    END;
    v_account_sid := r.config_values->>'account_sid';

    -- v2_senders (estrutura rica: sender_id, sid, status)
    IF jsonb_typeof(r.config_values->'v2_senders') = 'array' THEN
      FOR s IN SELECT * FROM jsonb_array_elements(r.config_values->'v2_senders') LOOP
        v_addr := regexp_replace(COALESCE(s->>'sender_id',''), '^(whatsapp:|tel:|sms:)', '');
        IF v_addr = '' THEN v_addr := NULL; END IF;

        INSERT INTO public.communication_endpoints (
          organization_id, organization_integration_id, channel,
          external_account_id, sender_sid, external_address,
          display_name, status, metadata
        ) VALUES (
          r.organization_id, r.oi_id, v_channel,
          v_account_sid, s->>'sid', v_addr,
          COALESCE(s->>'display_name', v_addr),
          lower(COALESCE(s->>'status','unknown')),
          s
        )
        ON CONFLICT (organization_id, sender_sid) WHERE sender_sid IS NOT NULL
        DO UPDATE SET
          organization_integration_id = EXCLUDED.organization_integration_id,
          external_account_id = COALESCE(EXCLUDED.external_account_id, communication_endpoints.external_account_id),
          external_address = COALESCE(EXCLUDED.external_address, communication_endpoints.external_address),
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = now();

        IF FOUND THEN v_updated := v_updated + 1; ELSE v_inserted := v_inserted + 1; END IF;
      END LOOP;
    END IF;

    -- available_numbers (lista simples de E.164)
    IF jsonb_typeof(r.config_values->'available_numbers') = 'array' THEN
      FOR s IN SELECT * FROM jsonb_array_elements(r.config_values->'available_numbers') LOOP
        v_addr := CASE jsonb_typeof(s)
          WHEN 'string' THEN trim(both '"' FROM s::text)
          WHEN 'object' THEN s->>'phone_number'
          ELSE NULL
        END;
        IF v_addr IS NULL OR v_addr = '' THEN CONTINUE; END IF;

        INSERT INTO public.communication_endpoints (
          organization_id, organization_integration_id, channel,
          external_account_id, external_address, display_name, status, metadata
        ) VALUES (
          r.organization_id, r.oi_id, v_channel,
          v_account_sid, v_addr, v_addr, 'unknown',
          jsonb_build_object('source','available_numbers','raw',s)
        )
        ON CONFLICT (organization_id, channel, external_address) WHERE external_address IS NOT NULL
        DO UPDATE SET
          organization_integration_id = COALESCE(EXCLUDED.organization_integration_id, communication_endpoints.organization_integration_id),
          external_account_id = COALESCE(communication_endpoints.external_account_id, EXCLUDED.external_account_id),
          updated_at = now();
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated, v_scanned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.populate_communication_endpoints_from_v2_senders() TO service_role;

-- 6) Helper de resolução p/ Railway / webhooks / triggers
CREATE OR REPLACE FUNCTION public.resolve_communication_endpoint(
  _organization_id UUID,
  _channel TEXT,
  _address TEXT
) RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.communication_endpoints
   WHERE organization_id = _organization_id
     AND channel = _channel
     AND external_address = regexp_replace(COALESCE(_address,''), '^(whatsapp:|tel:|sms:)', '')
     AND is_active
   ORDER BY status = 'online' DESC, updated_at DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_communication_endpoint(UUID,TEXT,TEXT) TO authenticated, service_role;

-- 7) Colunas nullable em messages e message_threads
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS endpoint_id UUID NULL REFERENCES public.communication_endpoints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_endpoint_sent
  ON public.messages (endpoint_id, sent_at)
  WHERE endpoint_id IS NOT NULL;

ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS primary_endpoint_id UUID NULL REFERENCES public.communication_endpoints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_threads_primary_endpoint
  ON public.message_threads (primary_endpoint_id, last_message_at)
  WHERE primary_endpoint_id IS NOT NULL;

-- 8) Executa population inicial (idempotente)
SELECT * FROM public.populate_communication_endpoints_from_v2_senders();
