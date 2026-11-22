-- Aceite de contato por canal (WhatsApp, e-mail, SMS) e finalidade (por ora só marketing).
-- Vale para todas as organizações. É a base das réguas: passo de marketing só sai com aceite.
-- O "não contatar" do contato continua valendo acima de tudo (bloqueia qualquer contato proativo).
--
-- contact_consents = situação atual (uma linha por contato + canal + finalidade).
-- contact_consent_events = histórico (quando, de onde, por quem) — prova do aceite para a LGPD.
-- Escrita só pela RPC rpc_set_contact_consent_v1 (ninguém edita as tabelas direto).

CREATE TABLE IF NOT EXISTS public.contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  purpose text NOT NULL DEFAULT 'marketing' CHECK (purpose IN ('marketing')),
  status text NOT NULL CHECK (status IN ('granted', 'revoked')),
  source text NOT NULL,
  source_detail text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, channel, purpose)
);
CREATE INDEX IF NOT EXISTS idx_contact_consents_org ON public.contact_consents (organization_id, channel, status);

CREATE TABLE IF NOT EXISTS public.contact_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  previous_status text,
  source text NOT NULL,
  source_detail text,
  actor_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_consent_events_contact ON public.contact_consent_events (contact_id, occurred_at DESC);

ALTER TABLE public.contact_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read contact consents" ON public.contact_consents;
CREATE POLICY "Org members read contact consents" ON public.contact_consents
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
DROP POLICY IF EXISTS "Org members read contact consent events" ON public.contact_consent_events;
CREATE POLICY "Org members read contact consent events" ON public.contact_consent_events
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));

REVOKE INSERT, UPDATE, DELETE ON public.contact_consents, public.contact_consent_events FROM authenticated, anon;
REVOKE ALL ON public.contact_consents, public.contact_consent_events FROM anon;

-- Grava o aceite (ou a recusa). p_channel = 'whatsapp' | 'email' | 'sms' | 'all' (todos os canais).
-- p_source: de onde veio (webhook, form, whatsapp_button, unsubscribe_link, user, import, api).
-- Sempre registra no histórico; a situação atual só muda quando o status muda.
CREATE OR REPLACE FUNCTION public.rpc_set_contact_consent_v1(
  p_contact_id uuid,
  p_channel text,
  p_granted boolean,
  p_source text,
  p_source_detail text DEFAULT NULL,
  p_purpose text DEFAULT 'marketing'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_actor uuid;
  v_channels text[];
  v_channel text;
  v_status text := CASE WHEN p_granted THEN 'granted' ELSE 'revoked' END;
  v_prev text;
  v_changed integer := 0;
BEGIN
  IF p_granted IS NULL THEN RAISE EXCEPTION 'granted_required' USING ERRCODE = '22023'; END IF;
  IF p_purpose IS DISTINCT FROM 'marketing' THEN RAISE EXCEPTION 'invalid_purpose' USING ERRCODE = '22023'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('webhook', 'form', 'whatsapp_button', 'unsubscribe_link', 'user', 'import', 'api') THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023';
  END IF;
  v_channels := CASE WHEN p_channel = 'all' THEN ARRAY['whatsapp', 'email', 'sms'] ELSE ARRAY[p_channel] END;
  IF NOT v_channels <@ ARRAY['whatsapp', 'email', 'sms'] THEN RAISE EXCEPTION 'invalid_channel' USING ERRCODE = '22023'; END IF;

  SELECT organization_id INTO v_org FROM contacts WHERE id = p_contact_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002'; END IF;

  -- Usuário do app: precisa ser da org do contato. Execução interna (service_role) passa.
  IF current_user IN ('authenticated', 'anon') THEN
    IF NOT (v_org = ANY (current_user_org_ids())) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    v_actor := current_user_id();
  END IF;

  FOREACH v_channel IN ARRAY v_channels LOOP
    SELECT status INTO v_prev FROM contact_consents
    WHERE contact_id = p_contact_id AND channel = v_channel AND purpose = p_purpose
    FOR UPDATE;

    INSERT INTO contact_consent_events (organization_id, contact_id, channel, purpose, status, previous_status, source, source_detail, actor_user_id)
    VALUES (v_org, p_contact_id, v_channel, p_purpose, v_status, v_prev, p_source, left(p_source_detail, 300), v_actor);

    IF v_prev IS DISTINCT FROM v_status THEN
      INSERT INTO contact_consents (organization_id, contact_id, channel, purpose, status, source, source_detail, updated_by, updated_at)
      VALUES (v_org, p_contact_id, v_channel, p_purpose, v_status, p_source, left(p_source_detail, 300), v_actor, now())
      ON CONFLICT (contact_id, channel, purpose) DO UPDATE SET
        status = EXCLUDED.status, source = EXCLUDED.source, source_detail = EXCLUDED.source_detail,
        updated_by = EXCLUDED.updated_by, updated_at = now();
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'channels', to_jsonb(v_channels), 'changed', v_changed);
END;
$function$;

-- Pode mandar marketing por este canal? Não contatar bloqueia; sem registro = não (precisa de aceite).
CREATE OR REPLACE FUNCTION public.fn_contact_marketing_allowed(p_contact_id uuid, p_channel text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM contacts c
    JOIN contact_consents cc ON cc.contact_id = c.id AND cc.channel = p_channel AND cc.purpose = 'marketing'
    WHERE c.id = p_contact_id AND c.deleted_at IS NULL
      AND c.do_not_contact IS NOT TRUE AND cc.status = 'granted'
  );
$function$;

REVOKE ALL ON FUNCTION public.rpc_set_contact_consent_v1(uuid, text, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_contact_consent_v1(uuid, text, boolean, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_contact_marketing_allowed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contact_marketing_allowed(uuid, text) TO service_role;
