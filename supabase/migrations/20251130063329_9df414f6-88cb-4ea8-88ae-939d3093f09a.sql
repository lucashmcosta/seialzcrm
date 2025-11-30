-- Admin Integrations: Master configuration by admins
CREATE TABLE admin_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'coming_soon', -- coming_soon, beta, available, deprecated
  category TEXT NOT NULL DEFAULT 'other', -- communication, payment, marketing, automation, other
  documentation_url TEXT,
  config_schema JSONB DEFAULT '{}', -- Define campos de configuração (app_id, secret, scopes, etc)
  master_config JSONB DEFAULT '{}', -- Credenciais master gerenciadas pelos admins
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Organization Integrations: Plug-and-play connections by CRM users
CREATE TABLE organization_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES admin_integrations(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  connected_account JSONB DEFAULT '{}', -- Dados da conta conectada (page_id, token, etc)
  config_values JSONB DEFAULT '{}', -- Valores específicos da org se necessário
  connected_at TIMESTAMPTZ,
  connected_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(integration_id, organization_id)
);

-- Documentation: Managed by admins
CREATE TABLE documentation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown
  version TEXT DEFAULT '1.0.0',
  is_public BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft', -- draft, published
  updated_by_admin_id UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies for admin_integrations
ALTER TABLE admin_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage integrations"
  ON admin_integrations FOR ALL
  USING (is_admin_user());

CREATE POLICY "Users can view available and beta integrations"
  ON admin_integrations FOR SELECT
  USING (status IN ('available', 'beta'));

-- RLS Policies for organization_integrations
ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all org integrations"
  ON organization_integrations FOR SELECT
  USING (is_admin_user());

CREATE POLICY "Users can manage integrations in their org"
  ON organization_integrations FOR ALL
  USING (user_has_org_access(organization_id));

-- RLS Policies for documentation
ALTER TABLE documentation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage documentation"
  ON documentation FOR ALL
  USING (is_admin_user());

CREATE POLICY "Users can view public documentation"
  ON documentation FOR SELECT
  USING (is_public = true AND status = 'published');

-- Indexes for performance
CREATE INDEX idx_admin_integrations_status ON admin_integrations(status);
CREATE INDEX idx_admin_integrations_category ON admin_integrations(category);
CREATE INDEX idx_organization_integrations_org ON organization_integrations(organization_id);
CREATE INDEX idx_organization_integrations_integration ON organization_integrations(integration_id);
CREATE INDEX idx_documentation_module ON documentation(module);
CREATE INDEX idx_documentation_public ON documentation(is_public, status);