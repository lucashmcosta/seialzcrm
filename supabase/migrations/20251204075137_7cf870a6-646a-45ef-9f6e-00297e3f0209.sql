-- Tabela para API Keys por organização
CREATE TABLE public.organization_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default API Key',
  api_key TEXT NOT NULL UNIQUE,
  scopes TEXT[] DEFAULT ARRAY['leads:write'],
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id UUID REFERENCES public.users(id)
);

-- Índice para busca rápida por API Key
CREATE INDEX idx_org_api_keys_key ON public.organization_api_keys(api_key);
CREATE INDEX idx_org_api_keys_org ON public.organization_api_keys(organization_id);

-- RLS
ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their org API keys"
  ON public.organization_api_keys FOR ALL
  USING (user_has_org_access(organization_id));

-- Campos de origem no contato
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS utm_campaign TEXT;