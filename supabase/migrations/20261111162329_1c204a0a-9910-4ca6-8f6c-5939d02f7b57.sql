CREATE TABLE public.whatsapp_otp_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_hash text NOT NULL,
  phone_last4 text NOT NULL,
  template_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  error_code text,
  meta_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_otp_send_log_rate_idx ON public.whatsapp_otp_send_log (organization_id, phone_hash, created_at DESC);
GRANT ALL ON public.whatsapp_otp_send_log TO service_role;
REVOKE ALL ON public.whatsapp_otp_send_log FROM anon, authenticated;
ALTER TABLE public.whatsapp_otp_send_log ENABLE ROW LEVEL SECURITY;