-- Create organization_phone_numbers table for call routing
CREATE TABLE public.organization_phone_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  friendly_name TEXT,
  twilio_phone_sid TEXT,
  is_primary BOOLEAN DEFAULT true,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ring_strategy TEXT NOT NULL DEFAULT 'all' CHECK (ring_strategy IN ('all', 'specific_users', 'round_robin')),
  ring_users UUID[] DEFAULT '{}',
  ring_timeout_seconds INTEGER DEFAULT 30,
  voicemail_enabled BOOLEAN DEFAULT false,
  voicemail_greeting TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create unique constraint for phone number per organization
CREATE UNIQUE INDEX idx_org_phone_number ON public.organization_phone_numbers(organization_id, phone_number);

-- Enable RLS
ALTER TABLE public.organization_phone_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage phone numbers in their org"
ON public.organization_phone_numbers
FOR ALL
USING (user_has_org_access(organization_id));

-- Trigger for updated_at
CREATE TRIGGER update_organization_phone_numbers_updated_at
BEFORE UPDATE ON public.organization_phone_numbers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing phone numbers from organization_integrations
INSERT INTO public.organization_phone_numbers (organization_id, phone_number, friendly_name, is_primary, ring_strategy)
SELECT 
  oi.organization_id,
  oi.config_values->>'phone_number' as phone_number,
  'Número Principal' as friendly_name,
  true as is_primary,
  'all' as ring_strategy
FROM public.organization_integrations oi
INNER JOIN public.admin_integrations ai ON ai.id = oi.integration_id
WHERE ai.slug = 'twilio-voice'
  AND oi.is_enabled = true
  AND oi.config_values->>'phone_number' IS NOT NULL
  AND oi.config_values->>'phone_number' != ''
ON CONFLICT (organization_id, phone_number) DO NOTHING;