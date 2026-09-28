-- Configuração por organização/conta; links privados nunca são persistidos aqui.
CREATE TABLE public.signature_whatsapp_settings (
  organization_integration_id uuid PRIMARY KEY REFERENCES public.organization_integrations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.whatsapp_templates(id),
  header_image_url text,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.signature_whatsapp_deliveries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  request_id uuid NOT NULL REFERENCES public.signature_requests(id),
  participant_id uuid NOT NULL REFERENCES public.signature_request_participants(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  endpoint_id uuid NOT NULL REFERENCES public.communication_endpoints(id),
  template_id uuid NOT NULL REFERENCES public.whatsapp_templates(id),
  created_by uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','unknown')),
  message_id uuid REFERENCES public.messages(id),
  thread_id uuid REFERENCES public.message_threads(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Uma chamada concorrente ou um timeout não podem provocar outro envio silencioso.
CREATE UNIQUE INDEX signature_whatsapp_delivery_inflight
  ON public.signature_whatsapp_deliveries(participant_id) WHERE status IN ('pending','unknown');
CREATE INDEX signature_whatsapp_delivery_request ON public.signature_whatsapp_deliveries(request_id, created_at DESC);
ALTER TABLE public.signature_whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_whatsapp_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signature_whatsapp_settings, public.signature_whatsapp_deliveries FROM anon, authenticated;
GRANT ALL ON public.signature_whatsapp_settings, public.signature_whatsapp_deliveries TO service_role;
COMMENT ON TABLE public.signature_whatsapp_deliveries IS 'Auditoria sem token; acesso somente pelo backend após RLS da solicitação e do contato.';
