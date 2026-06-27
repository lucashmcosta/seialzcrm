
ALTER TABLE public.whatsapp_templates ALTER COLUMN twilio_content_sid DROP NOT NULL;

ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'twilio',
  ADD COLUMN IF NOT EXISTS organization_integration_id uuid REFERENCES public.organization_integrations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS meta_template_name text,
  ADD COLUMN IF NOT EXISTS meta_waba_id text,
  ADD COLUMN IF NOT EXISTS components jsonb;

UPDATE public.whatsapp_templates SET provider = 'twilio' WHERE provider IS NULL;

DO $$ BEGIN
  ALTER TABLE public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_provider_check
    CHECK (provider IN ('twilio','meta_cloud_api'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_meta_unique
  ON public.whatsapp_templates (organization_integration_id, meta_template_name, language)
  WHERE provider = 'meta_cloud_api';

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_twilio_unique
  ON public.whatsapp_templates (organization_id, twilio_content_sid)
  WHERE provider = 'twilio' AND twilio_content_sid IS NOT NULL;
