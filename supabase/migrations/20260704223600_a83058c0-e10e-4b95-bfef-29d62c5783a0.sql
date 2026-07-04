-- PR1: governança interna de templates por função do número.
-- Adiciona array de purposes permitidos. Default seguro: NULL/vazio → oculto no selector.
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS allowed_purposes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.whatsapp_templates.allowed_purposes IS
  'Purposes de communication_endpoints que podem disparar este template. Vazio = oculto no selector (default seguro). Valores esperados: commercial, customer_service, vendor_personal, other.';

-- Índice GIN para filtro `allowed_purposes && ARRAY[endpoint.purpose]`
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_allowed_purposes
  ON public.whatsapp_templates USING gin (allowed_purposes);