ALTER TABLE public.registry_lookup_audit
  ADD COLUMN IF NOT EXISTS provider_code text,
  ADD COLUMN IF NOT EXISTS provider_message text;

ALTER TABLE public.contact_identity_profiles
  ADD COLUMN IF NOT EXISTS last_provider_code text,
  ADD COLUMN IF NOT EXISTS last_provider_message text;

ALTER TYPE public.cpf_verification_status ADD VALUE IF NOT EXISTS 'not_found';