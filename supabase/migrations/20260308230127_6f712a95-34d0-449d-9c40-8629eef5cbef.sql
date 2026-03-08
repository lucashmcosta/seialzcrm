ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_source_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_headline text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_body text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_media_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_source_id text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_source_type text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_captured_at timestamptz;