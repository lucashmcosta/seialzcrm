ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS meta_ad_id text;
CREATE INDEX IF NOT EXISTS idx_contacts_meta_ad_id ON public.contacts(organization_id, meta_ad_id) WHERE meta_ad_id IS NOT NULL;