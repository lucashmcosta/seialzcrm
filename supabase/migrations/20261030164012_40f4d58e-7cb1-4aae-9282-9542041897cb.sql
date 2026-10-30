CREATE TABLE public.client_portal_otp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  phone_last4 text,
  meta_message_id text,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_portal_otp_log_rate_idx ON public.client_portal_otp_log (contact_id, created_at DESC);
GRANT ALL ON public.client_portal_otp_log TO service_role;
REVOKE ALL ON public.client_portal_otp_log FROM anon, authenticated;
ALTER TABLE public.client_portal_otp_log ENABLE ROW LEVEL SECURITY;