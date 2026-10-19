ALTER TABLE public.social_conversations
  ADD COLUMN profile_page_id text,
  ADD COLUMN profile_refresh_after timestamptz,
  ADD COLUMN profile_data jsonb;
-- Existing RLS remains service-role only. No frontend SELECT policy is added.
