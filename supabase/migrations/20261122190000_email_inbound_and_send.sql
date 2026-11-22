-- E-mail — fase 5 (parte 3): a resposta do lead por e-mail conta como resposta da régua.
-- Com recebimento ligado, os e-mails saem com "responder para" no endereço de recebimento da Resend da org;
-- o aviso email.received chega ao Seialz, que acha o contato pelo remetente, encerra/pausa a régua conforme a
-- régua, registra na linha do tempo, avisa o responsável e encaminha uma cópia para a caixa da equipe.

ALTER TABLE public.organization_email_settings ADD COLUMN IF NOT EXISTS inbound_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.organization_email_settings ADD COLUMN IF NOT EXISTS inbound_address text;

CREATE TABLE IF NOT EXISTS public.email_inbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_email_id text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  from_email text,
  subject text,
  text_excerpt text,
  forwarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_email_id)
);
CREATE INDEX IF NOT EXISTS idx_email_inbound_contact ON public.email_inbound (contact_id, created_at DESC);
ALTER TABLE public.email_inbound ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read email_inbound" ON public.email_inbound;
CREATE POLICY "Org members read email_inbound" ON public.email_inbound FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
REVOKE INSERT, UPDATE, DELETE ON public.email_inbound FROM authenticated;
REVOKE ALL ON public.email_inbound FROM anon;

-- Resposta do contato (qualquer canal fora do WhatsApp): mesma regra da mensagem recebida.
CREATE OR REPLACE FUNCTION public.fn_cadence_register_reply(p_contact uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_e record; v_n integer := 0;
BEGIN
  FOR v_e IN
    SELECT e.id, c.on_reply FROM cadence_enrollments e JOIN cadences c ON c.id = e.cadence_id
    WHERE e.contact_id = p_contact AND e.status = 'active'
  LOOP
    UPDATE cadence_enrollments SET last_reply_at = now(), updated_at = now() WHERE id = v_e.id;
    IF v_e.on_reply = 'cancel' THEN
      PERFORM fn_cadence_end_enrollment(v_e.id, 'cancelled', 'o lead respondeu');
    ELSIF v_e.on_reply = 'pause' THEN
      UPDATE cadence_enrollments SET status = 'paused', paused_at = now(), updated_at = now() WHERE id = v_e.id;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $function$;

-- E-mail recebido. Uma vez por e-mail (a Resend pode repetir o aviso). Devolve o que o webhook precisa para
-- encaminhar a cópia à equipe.
CREATE OR REPLACE FUNCTION public.fn_email_inbound(p_org uuid, p_provider_id text, p_from text, p_subject text, p_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_from text := lower(btrim(coalesce(substring(p_from from '<([^>]+)>'), p_from)));
  v_id uuid; v_contact record; v_opp uuid; v_owner uuid; v_replies integer := 0;
BEGIN
  INSERT INTO email_inbound (organization_id, provider_email_id, from_email, subject, text_excerpt)
  VALUES (p_org, p_provider_id, left(v_from, 200), left(p_subject, 300), left(p_text, 2000))
  ON CONFLICT (organization_id, provider_email_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('duplicate', true); END IF;

  SELECT id, owner_user_id INTO v_contact FROM contacts
  WHERE organization_id = p_org AND deleted_at IS NULL AND lower(btrim(email)) = v_from
  ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_contact.id IS NOT NULL THEN
    UPDATE email_inbound SET contact_id = v_contact.id WHERE id = v_id;
    v_replies := fn_cadence_register_reply(v_contact.id);
    SELECT id, owner_user_id INTO v_opp, v_owner FROM opportunities
    WHERE contact_id = v_contact.id AND organization_id = p_org AND status = 'open' AND deleted_at IS NULL
    ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    v_owner := coalesce(v_owner, v_contact.owner_user_id);
    INSERT INTO activities (organization_id, contact_id, opportunity_id, activity_type, title, body, occurred_at)
    VALUES (p_org, v_contact.id, v_opp, 'message', 'E-mail recebido: ' || left(coalesce(p_subject, '(sem assunto)'), 150), left(p_text, 2000), now());
    IF v_owner IS NOT NULL THEN
      INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
      VALUES (p_org, v_owner, 'email_reply', 'Resposta por e-mail', left(coalesce(p_subject, '') || ' — ' || coalesce(p_text, ''), 300),
        CASE WHEN v_opp IS NOT NULL THEN 'opportunity' ELSE 'contact' END, coalesce(v_opp, v_contact.id));
    END IF;
  END IF;
  RETURN jsonb_build_object('duplicate', false, 'inbound_id', v_id, 'contact_id', v_contact.id, 'opportunity_id', v_opp, 'replies', v_replies);
END $function$;

REVOKE ALL ON FUNCTION public.fn_cadence_register_reply(uuid), public.fn_email_inbound(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cadence_register_reply(uuid), public.fn_email_inbound(uuid, text, text, text, text) TO service_role;
