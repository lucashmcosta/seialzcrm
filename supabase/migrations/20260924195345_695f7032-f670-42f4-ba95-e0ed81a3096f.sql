CREATE TABLE public.signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  engine text NOT NULL DEFAULT 'suvsign_v2',
  template_id text,
  template_name text,
  provider_operation_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  provider_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  sent_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signature_requests_engine_chk CHECK (engine IN ('suvsign_v2')),
  CONSTRAINT signature_requests_status_chk CHECK (status IN ('draft','sent','in_progress','completing','completed','cancelled'))
);
CREATE UNIQUE INDEX uniq_signature_requests_idem ON public.signature_requests(idempotency_key);
CREATE UNIQUE INDEX uniq_signature_requests_provider_op ON public.signature_requests(organization_id, provider_operation_id) WHERE provider_operation_id IS NOT NULL;
CREATE INDEX idx_signature_requests_opp ON public.signature_requests(opportunity_id, created_at DESC);
CREATE INDEX idx_signature_requests_provider_op ON public.signature_requests(provider_operation_id) WHERE provider_operation_id IS NOT NULL;

GRANT SELECT ON public.signature_requests TO authenticated;
GRANT ALL ON public.signature_requests TO service_role;
REVOKE ALL ON public.signature_requests FROM anon;
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signature_requests_select_follows_opportunity" ON public.signature_requests
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids())
         AND EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = signature_requests.opportunity_id));

CREATE TABLE public.signature_request_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ref text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  cpf text,
  role text NOT NULL DEFAULT 'signer',
  template_role text,
  order_index integer NOT NULL DEFAULT 0,
  provider_participant_id text,
  status text NOT NULL DEFAULT 'pending',
  opened_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, ref)
);
CREATE INDEX idx_sig_participants_provider ON public.signature_request_participants(provider_participant_id) WHERE provider_participant_id IS NOT NULL;

GRANT SELECT ON public.signature_request_participants TO authenticated;
GRANT ALL ON public.signature_request_participants TO service_role;
REVOKE ALL ON public.signature_request_participants FROM anon;
ALTER TABLE public.signature_request_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signature_participants_select_follows_request" ON public.signature_request_participants
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.signature_requests r WHERE r.id = signature_request_participants.request_id));

CREATE TABLE public.suvsign_v2_credentials (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key_ciphertext text NOT NULL,
  api_key_last4 text,
  webhook_secret_ciphertext text,
  base_url text NOT NULL DEFAULT 'https://vpysvlbfsvomwrgbpybc.supabase.co/functions/v1',
  last_test_at timestamptz,
  last_test_ok boolean,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.suvsign_v2_credentials TO service_role;
REVOKE ALL ON public.suvsign_v2_credentials FROM anon, authenticated;
ALTER TABLE public.suvsign_v2_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_sigreq_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_signature_requests_updated BEFORE UPDATE ON public.signature_requests FOR EACH ROW EXECUTE FUNCTION public.fn_sigreq_touch_updated_at();
CREATE TRIGGER trg_signature_participants_updated BEFORE UPDATE ON public.signature_request_participants FOR EACH ROW EXECUTE FUNCTION public.fn_sigreq_touch_updated_at();
CREATE TRIGGER trg_suvsign_v2_credentials_updated BEFORE UPDATE ON public.suvsign_v2_credentials FOR EACH ROW EXECUTE FUNCTION public.fn_sigreq_touch_updated_at();

INSERT INTO public.integration_feature_flags (flag_key, organization_id, enabled, metadata)
SELECT 'signing.suvsign_v2', NULL, false, '{"note":"SuvSign V2 no Seialz Web — global OFF"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.integration_feature_flags WHERE flag_key='signing.suvsign_v2' AND organization_id IS NULL);