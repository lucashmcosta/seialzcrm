
-- Move existing OpenAI/Claude to AI category + mark as ai_provider; drop plaintext key fields from schema
UPDATE public.admin_integrations
SET
  category = 'ai',
  config_schema = jsonb_build_object(
    'integration_kind', 'ai_provider',
    'provider', 'openai',
    'fields', '[
      {"key":"default_model","label":"Modelo Padrão","type":"select","required":false,"default":"gpt-4o-mini","options":["gpt-4o","gpt-4o-mini","gpt-4-turbo","gpt-3.5-turbo"],"description":"Modelo usado nas requisições."},
      {"key":"max_tokens","label":"Max Tokens","type":"number","required":false,"default":1024,"description":"Limite máximo de tokens por resposta."}
    ]'::jsonb
  ),
  sort_order = COALESCE(sort_order, 100)
WHERE slug = 'openai-gpt';

UPDATE public.admin_integrations
SET
  category = 'ai',
  config_schema = jsonb_build_object(
    'integration_kind', 'ai_provider',
    'provider', 'anthropic',
    'fields', '[
      {"key":"default_model","label":"Modelo Padrão","type":"select","required":false,"default":"claude-sonnet-4-6","options":["claude-haiku-4-5","claude-sonnet-4-6","claude-opus-4-6","claude-3-5-haiku-20241022","claude-3-5-sonnet-20241022","claude-3-7-sonnet-20250219"],"description":"Modelo usado nas requisições."},
      {"key":"max_tokens","label":"Max Tokens","type":"number","required":false,"default":1024,"description":"Limite máximo de tokens por resposta."}
    ]'::jsonb
  ),
  sort_order = COALESCE(sort_order, 101)
WHERE slug = 'claude-ai';

-- Insert Gemini (Google)
INSERT INTO public.admin_integrations (slug, name, description, category, status, sort_order, config_schema)
VALUES (
  'google-gemini',
  'Gemini (Google)',
  'Modelos Gemini do Google AI Studio. Use sua própria API key (BYOK) para chamadas LLM.',
  'ai',
  'available',
  102,
  jsonb_build_object(
    'integration_kind', 'ai_provider',
    'provider', 'gemini',
    'fields', '[
      {"key":"default_model","label":"Modelo Padrão","type":"select","required":false,"default":"gemini-2.0-flash","options":["gemini-2.0-flash","gemini-2.0-flash-lite","gemini-1.5-pro","gemini-1.5-flash"],"description":"Modelo usado nas requisições."},
      {"key":"max_tokens","label":"Max Tokens","type":"number","required":false,"default":1024,"description":"Limite máximo de tokens por resposta."}
    ]'::jsonb
  )
)
ON CONFLICT (slug) DO UPDATE SET
  category = EXCLUDED.category,
  config_schema = EXCLUDED.config_schema,
  status = EXCLUDED.status;

-- Insert ElevenLabs
INSERT INTO public.admin_integrations (slug, name, description, category, status, sort_order, config_schema)
VALUES (
  'elevenlabs',
  'ElevenLabs',
  'Síntese e transcrição de voz com ElevenLabs. Use sua própria API key (BYOK).',
  'ai',
  'available',
  103,
  jsonb_build_object(
    'integration_kind', 'ai_provider',
    'provider', 'elevenlabs',
    'fields', '[
      {"key":"default_voice_id","label":"Voice ID Padrão","type":"text","required":false,"placeholder":"21m00Tcm4TlvDq8ikWAM","description":"ID da voz padrão para TTS (opcional)."}
    ]'::jsonb
  )
)
ON CONFLICT (slug) DO UPDATE SET
  category = EXCLUDED.category,
  config_schema = EXCLUDED.config_schema,
  status = EXCLUDED.status;
