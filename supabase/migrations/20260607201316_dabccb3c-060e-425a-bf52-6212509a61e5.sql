ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS fbclid_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_lead_id text,
  ADD COLUMN IF NOT EXISTS meta_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_campaign_id text;

CREATE INDEX IF NOT EXISTS idx_contacts_meta_adset_id ON public.contacts(meta_adset_id) WHERE meta_adset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_meta_campaign_id ON public.contacts(meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_meta_lead_id ON public.contacts(meta_lead_id) WHERE meta_lead_id IS NOT NULL;