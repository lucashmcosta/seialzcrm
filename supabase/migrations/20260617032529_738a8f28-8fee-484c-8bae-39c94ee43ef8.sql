ALTER TABLE public.communication_endpoints
  ADD COLUMN IF NOT EXISTS inbound_settings jsonb;

COMMENT ON COLUMN public.communication_endpoints.inbound_settings IS
  'Regras de entrada (auto_create_contact, default_lifecycle_stage, auto_create_opportunity, default_stage_id) específicas deste número. NULL = herda de organization_integrations.whatsapp_inbound_settings.';