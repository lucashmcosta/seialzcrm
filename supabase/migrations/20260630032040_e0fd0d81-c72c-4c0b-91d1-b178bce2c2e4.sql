ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cs_inbox_includes_service_endpoints boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.organizations.cs_inbox_includes_service_endpoints IS
  'Quando true, a Inbox de Atendimento também inclui threads cujo primary_endpoint.purpose = customer_service, independente de contact.lifecycle_stage. Útil para orgs com número dedicado de CS.';