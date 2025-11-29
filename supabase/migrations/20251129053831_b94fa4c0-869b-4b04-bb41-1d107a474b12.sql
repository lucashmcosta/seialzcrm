-- Phase 4 & 5: Tags, Custom Fields, Saved Views, Messaging, Calls, Attachments, Invitations

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage tags in their org"
ON public.tags
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

CREATE TABLE public.tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tag_id, entity_type, entity_id)
);

ALTER TABLE public.tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage tag assignments in their org"
ON public.tag_assignments
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Custom Fields
CREATE TABLE public.custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options JSONB,
  is_required BOOLEAN DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage custom field definitions in their org"
ON public.custom_field_definitions
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

CREATE TABLE public.custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_definition_id UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(record_id, field_definition_id)
);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage custom field values in their org"
ON public.custom_field_values
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Saved Views
CREATE TABLE public.saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  filters JSONB DEFAULT '{}',
  sort JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage saved views in their org"
ON public.saved_views
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Message Threads
CREATE TABLE public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  channel TEXT DEFAULT 'internal',
  subject TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage message threads in their org"
ON public.message_threads
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  direction TEXT DEFAULT 'internal',
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  is_sample BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage messages in their org"
ON public.messages
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Calls
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  status TEXT DEFAULT 'completed',
  started_at TIMESTAMPTZ DEFAULT now(),
  duration_seconds INTEGER,
  notes TEXT,
  is_sample BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage calls in their org"
ON public.calls
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Attachments
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'attachments',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_sample BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage attachments in their org"
ON public.attachments
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Invitations
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  permission_profile_id UUID REFERENCES public.permission_profiles(id) ON DELETE SET NULL,
  invited_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage invitations in their org"
ON public.invitations
FOR ALL
TO authenticated
USING (user_has_org_access(organization_id));

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false);

-- Storage policies for attachments
CREATE POLICY "Users can view attachments in their org"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments' AND
  EXISTS (
    SELECT 1 FROM public.attachments
    WHERE storage_path = storage.objects.name
    AND user_has_org_access(organization_id)
  )
);

CREATE POLICY "Users can upload attachments in their org"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Users can delete attachments in their org"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments' AND
  EXISTS (
    SELECT 1 FROM public.attachments
    WHERE storage_path = storage.objects.name
    AND user_has_org_access(organization_id)
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_tags_updated_at
BEFORE UPDATE ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_custom_field_definitions_updated_at
BEFORE UPDATE ON public.custom_field_definitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_custom_field_values_updated_at
BEFORE UPDATE ON public.custom_field_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_saved_views_updated_at
BEFORE UPDATE ON public.saved_views
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_threads_updated_at
BEFORE UPDATE ON public.message_threads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();