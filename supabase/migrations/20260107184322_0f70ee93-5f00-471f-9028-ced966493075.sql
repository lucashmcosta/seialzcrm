-- ============================================
-- WHATSAPP INTEGRATION SCHEMA
-- ============================================

-- 1. Create whatsapp_templates table
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Twilio Content API data
  twilio_content_sid TEXT NOT NULL,
  friendly_name TEXT NOT NULL,
  language TEXT DEFAULT 'pt_BR',
  
  -- Template content
  template_type TEXT DEFAULT 'text' CHECK (template_type IN ('text', 'media', 'interactive')),
  body TEXT NOT NULL,
  header TEXT,
  footer TEXT,
  variables JSONB DEFAULT '[]',
  
  -- Status from Twilio
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  
  -- Metadata
  category TEXT CHECK (category IN ('marketing', 'utility', 'authentication')),
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for whatsapp_templates
CREATE INDEX idx_whatsapp_templates_org ON public.whatsapp_templates(organization_id);
CREATE UNIQUE INDEX idx_whatsapp_templates_sid ON public.whatsapp_templates(organization_id, twilio_content_sid);
CREATE INDEX idx_whatsapp_templates_status ON public.whatsapp_templates(organization_id, status) WHERE is_active = true;

-- 2. Add WhatsApp fields to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS whatsapp_message_sid TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS whatsapp_status TEXT CHECK (whatsapp_status IN ('sending', 'sent', 'delivered', 'read', 'failed'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.whatsapp_templates(id);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for WhatsApp message SID lookup
CREATE INDEX IF NOT EXISTS idx_messages_wa_sid ON public.messages(whatsapp_message_sid) WHERE whatsapp_message_sid IS NOT NULL;

-- 3. Add WhatsApp fields to message_threads table
ALTER TABLE public.message_threads ADD COLUMN IF NOT EXISTS whatsapp_last_inbound_at TIMESTAMPTZ;
ALTER TABLE public.message_threads ADD COLUMN IF NOT EXISTS external_id TEXT;

-- 4. Enable RLS on whatsapp_templates
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_templates
CREATE POLICY "Users can view templates from their organization"
  ON public.whatsapp_templates FOR SELECT
  USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      JOIN public.users u ON u.id = uo.user_id
      WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
    )
  );

CREATE POLICY "Users can insert templates in their organization"
  ON public.whatsapp_templates FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      JOIN public.users u ON u.id = uo.user_id
      WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
    )
  );

CREATE POLICY "Users can update templates in their organization"
  ON public.whatsapp_templates FOR UPDATE
  USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      JOIN public.users u ON u.id = uo.user_id
      WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
    )
  );

CREATE POLICY "Users can delete templates in their organization"
  ON public.whatsapp_templates FOR DELETE
  USING (
    organization_id IN (
      SELECT uo.organization_id FROM public.user_organizations uo
      JOIN public.users u ON u.id = uo.user_id
      WHERE u.auth_user_id = auth.uid() AND uo.is_active = true
    )
  );

-- 5. Trigger for updated_at on whatsapp_templates
CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable Realtime for messages (if not already enabled)
ALTER TABLE public.messages REPLICA IDENTITY FULL;