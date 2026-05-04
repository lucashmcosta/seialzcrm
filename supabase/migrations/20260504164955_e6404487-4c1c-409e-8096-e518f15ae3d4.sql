ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completion_notes TEXT,
  ADD COLUMN IF NOT EXISTS postpone_reason TEXT;