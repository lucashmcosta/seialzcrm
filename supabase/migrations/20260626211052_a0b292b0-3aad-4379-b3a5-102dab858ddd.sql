
-- 1) Provider column on communication_endpoints (DEFAULT 'twilio' permanece após migration).
-- Backfill: linhas existentes (provider IS NULL) viram 'twilio'.
UPDATE public.communication_endpoints
SET provider = 'twilio'
WHERE provider IS NULL;

ALTER TABLE public.communication_endpoints
  ALTER COLUMN provider SET DEFAULT 'twilio';

ALTER TABLE public.communication_endpoints
  ALTER COLUMN provider SET NOT NULL;

-- CHECK opcional para travar valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'communication_endpoints_provider_check'
  ) THEN
    ALTER TABLE public.communication_endpoints
      ADD CONSTRAINT communication_endpoints_provider_check
      CHECK (provider IN ('twilio','meta-cloud'));
  END IF;
END$$;

-- Lookup rápido do webhook Meta por phone_number_id (= sender_sid quando provider='meta-cloud')
CREATE INDEX IF NOT EXISTS communication_endpoints_meta_cloud_phone_idx
  ON public.communication_endpoints (sender_sid)
  WHERE provider = 'meta-cloud';

-- 2) Novo slug Meta WhatsApp Cloud em admin_integrations
INSERT INTO public.admin_integrations (
  name, slug, description, status, category, sort_order, config_schema
) VALUES (
  'Meta WhatsApp Cloud API',
  'meta-whatsapp-cloud',
  'Conecte seu número WhatsApp Business diretamente pela API oficial da Meta (Cloud API). Suporta envio e recebimento de mensagens dentro da janela 24h.',
  'beta',
  'whatsapp',
  20,
  jsonb_build_object(
    'requires_platform_secrets', jsonb_build_array('META_WHATSAPP_APP_SECRET','META_WHATSAPP_VERIFY_TOKEN'),
    'tenant_fields', jsonb_build_array('app_id','waba_id','phone_number_id','phone_e164','system_user_token')
  )
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      category = EXCLUDED.category,
      config_schema = EXCLUDED.config_schema;
