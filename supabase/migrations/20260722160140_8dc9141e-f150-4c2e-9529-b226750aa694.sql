
ALTER TABLE public.communication_endpoints
  ADD COLUMN IF NOT EXISTS requires_template_outside_window boolean NOT NULL DEFAULT true;

UPDATE public.communication_endpoints
  SET requires_template_outside_window = false
  WHERE provider = 'evolution_api';
