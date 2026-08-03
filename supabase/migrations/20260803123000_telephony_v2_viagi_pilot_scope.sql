-- Keep the first telephony V2 rollout restricted to Viagi and explicitly off
-- until the operator validates the existing Twilio Voice setup in the UI.
UPDATE public.feature_flags
SET
  organization_ids = ARRAY['b246ef6f-6242-4011-a112-6d8783d2896a'::uuid],
  is_enabled = false,
  updated_at = now()
WHERE name = 'telephony_v2';
