-- Add AI provider and model columns to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'auto';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS ai_model TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.ai_agents.ai_provider IS 'AI provider: auto (uses org integration), lovable-ai, claude-ai, openai-gpt';
COMMENT ON COLUMN public.ai_agents.ai_model IS 'Specific model to use, e.g., google/gemini-3-flash-preview, claude-sonnet-4-20250514, gpt-4o';