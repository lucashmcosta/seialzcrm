
-- Table for webhook field mappings per organization
CREATE TABLE public.webhook_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  entity_type TEXT NOT NULL DEFAULT 'contact' CHECK (entity_type IN ('contact', 'opportunity', 'activity')),
  external_field TEXT NOT NULL,
  internal_field TEXT NOT NULL,
  is_required BOOLEAN DEFAULT false,
  default_value TEXT,
  transform_type TEXT DEFAULT 'direct' CHECK (transform_type IN ('direct', 'phone_e164', 'lowercase', 'uppercase')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, direction, entity_type, external_field)
);

-- Enable RLS
ALTER TABLE public.webhook_field_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policy using existing function
CREATE POLICY "Users can manage field mappings in their org"
  ON public.webhook_field_mappings
  FOR ALL
  USING (user_has_org_access(organization_id))
  WITH CHECK (user_has_org_access(organization_id));

-- Trigger for updated_at
CREATE TRIGGER update_webhook_field_mappings_updated_at
  BEFORE UPDATE ON public.webhook_field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
