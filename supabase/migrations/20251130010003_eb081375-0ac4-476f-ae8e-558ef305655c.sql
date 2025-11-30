-- FASE 3: Companies Module

-- Tabela companies
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  phone text,
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- RLS para companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view companies in their org"
ON companies FOR SELECT
USING (user_has_org_access(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert companies in their org"
ON companies FOR INSERT
WITH CHECK (user_has_org_access(organization_id));

CREATE POLICY "Users can update companies in their org"
ON companies FOR UPDATE
USING (user_has_org_access(organization_id));

CREATE POLICY "Users can delete companies in their org"
ON companies FOR DELETE
USING (user_has_org_access(organization_id));

-- Adicionar company_id em contacts e opportunities
ALTER TABLE contacts ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- Indexes para performance
CREATE INDEX idx_companies_org_deleted ON companies(organization_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_contacts_company ON contacts(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_opportunities_company ON opportunities(company_id) WHERE company_id IS NOT NULL;

-- Trigger para updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit log trigger para companies
CREATE TRIGGER audit_companies_changes
AFTER INSERT OR UPDATE OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();