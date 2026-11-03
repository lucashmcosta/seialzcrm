CREATE TABLE public.client_portal_chat_events (
  conversation_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seialz_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  last_event text NOT NULL CHECK (last_event IN ('message.created','conversation.updated')),
  last_message_at timestamptz NOT NULL,
  last_from text NOT NULL CHECK (last_from IN ('client','staff')),
  unread_for_staff integer NOT NULL DEFAULT 0 CHECK (unread_for_staff >= 0),
  assigned_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_portal_chat_events_org_idx ON public.client_portal_chat_events (organization_id, last_message_at DESC);

GRANT ALL ON public.client_portal_chat_events TO service_role;
REVOKE ALL ON public.client_portal_chat_events FROM anon, authenticated;
GRANT SELECT ON public.client_portal_chat_events TO authenticated;

ALTER TABLE public.client_portal_chat_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_client_portal_chat(_org uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p jsonb;
BEGIN
  IF _org IS NULL OR public.current_user_id() IS NULL THEN RETURN false; END IF;
  p := public.perms_v2_for_user(_org, public.current_user_id());
  IF p IS NULL THEN RETURN false; END IF;
  RETURN COALESCE(p #>> '{dados,atendimentos,ver}','nenhum') <> 'nenhum';
END $$;
REVOKE EXECUTE ON FUNCTION public.can_view_client_portal_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_client_portal_chat(uuid) TO authenticated, service_role;

CREATE POLICY "Atendimento lê estado do chat do App"
ON public.client_portal_chat_events FOR SELECT TO authenticated
USING (organization_id = ANY(public.current_user_org_ids()) AND public.can_view_client_portal_chat(organization_id));

CREATE TRIGGER trg_client_portal_chat_events_updated_at
BEFORE UPDATE ON public.client_portal_chat_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_portal_chat_events;

INSERT INTO public.feature_flags (name, description, is_enabled, organization_ids)
SELECT 'client_portal_chat', 'Chat do App do cliente na tela de Atendimento', true, ARRAY['40ae935c-a7f7-4ad7-8ea4-91be6404a95f']::uuid[]
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE name = 'client_portal_chat');