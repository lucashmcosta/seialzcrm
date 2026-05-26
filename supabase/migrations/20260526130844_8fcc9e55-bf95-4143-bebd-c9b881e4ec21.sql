
INSERT INTO public.provider_pricing (provider, model, audio_per_minute_usd, effective_from)
VALUES
  ('openai', 'gpt-4o-transcribe', 0.00600, now()),
  ('openai', 'gpt-4o-mini-transcribe', 0.00300, now())
ON CONFLICT DO NOTHING;
