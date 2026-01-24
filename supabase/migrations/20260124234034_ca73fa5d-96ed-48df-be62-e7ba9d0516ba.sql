-- Adicionar campo source_external_id em contacts (source já existe)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_external_id TEXT;

-- Adicionar campos em opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_external_id TEXT;

-- Índices para busca de duplicatas e performance
CREATE INDEX IF NOT EXISTS idx_contacts_source_external ON contacts(source, source_external_id) 
  WHERE source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_source_external ON opportunities(source, source_external_id) 
  WHERE source_external_id IS NOT NULL;

-- Tabela genérica de logs de importação (reutilizável para outras integrações)
CREATE TABLE import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_slug TEXT NOT NULL, -- 'kommo', 'pipedrive', 'hubspot', etc
  
  -- Status e Progresso
  status TEXT DEFAULT 'pending', -- pending, running, paused, completed, failed, rolled_back
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Contagens
  total_contacts INTEGER DEFAULT 0,
  imported_contacts INTEGER DEFAULT 0,
  skipped_contacts INTEGER DEFAULT 0,
  total_opportunities INTEGER DEFAULT 0,
  imported_opportunities INTEGER DEFAULT 0,
  skipped_opportunities INTEGER DEFAULT 0,
  
  -- Progresso para Realtime
  current_batch INTEGER DEFAULT 0,
  total_batches INTEGER DEFAULT 0,
  progress_percent INTEGER DEFAULT 0,
  last_processed_item TEXT,
  
  -- Configurações usadas na migração
  config JSONB DEFAULT '{}', -- stage_mapping, duplicate_mode, credentials, etc
  
  -- Rollback (IDs criados)
  imported_contact_ids UUID[] DEFAULT '{}',
  imported_opportunity_ids UUID[] DEFAULT '{}',
  rollback_available BOOLEAN DEFAULT true,
  rollback_executed_at TIMESTAMPTZ,
  
  -- Erros
  errors JSONB DEFAULT '[]',
  error_count INTEGER DEFAULT 0,
  
  -- Auditoria
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS com isolamento por organização
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view import logs in their org" ON import_logs
  FOR SELECT USING (user_has_org_access(organization_id));

CREATE POLICY "Users can insert import logs in their org" ON import_logs
  FOR INSERT WITH CHECK (user_has_org_access(organization_id));

CREATE POLICY "Users can update import logs in their org" ON import_logs
  FOR UPDATE USING (user_has_org_access(organization_id));

CREATE POLICY "Users can delete import logs in their org" ON import_logs
  FOR DELETE USING (user_has_org_access(organization_id));

-- Habilitar Realtime para progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE import_logs;

-- Índice para busca por org e integração
CREATE INDEX idx_import_logs_org_integration ON import_logs(organization_id, integration_slug);
CREATE INDEX idx_import_logs_status ON import_logs(status) WHERE status IN ('running', 'paused');

-- Inserir integração Kommo no catálogo
INSERT INTO admin_integrations (name, slug, description, category, status, config_schema, sort_order)
VALUES (
  'Kommo (amoCRM)',
  'kommo',
  'Importe seus contatos e oportunidades do Kommo para começar a usar o CRM com seus dados existentes.',
  'automation',
  'available',
  '{
    "fields": [
      {"key": "subdomain", "label": "Subdomínio Kommo", "type": "text", "required": true, 
       "placeholder": "suaempresa", "description": "Se seu Kommo é suaempresa.kommo.com, digite suaempresa"},
      {"key": "access_token", "label": "Access Token", "type": "password", "required": true,
       "description": "Gere em Configurações > Integrações > Criar integração privada"}
    ]
  }',
  20
);