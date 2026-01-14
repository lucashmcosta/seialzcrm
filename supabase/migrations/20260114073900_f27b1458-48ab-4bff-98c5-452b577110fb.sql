-- Add feedback_history column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS feedback_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ai_agents.feedback_history IS 
  'Histórico de feedbacks aplicados ao prompt [{id, date, feedback, applied}]';