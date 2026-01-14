-- Add wizard_data column to store wizard input for prompt regeneration
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS wizard_data JSONB DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.ai_agents.wizard_data IS 'Stores wizard input data for regenerating agent prompt';