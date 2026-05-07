ALTER TABLE public.lead_form_questions
  ADD COLUMN target_entity text NOT NULL DEFAULT 'contact'
  CHECK (target_entity IN ('contact', 'opportunity'));

CREATE INDEX idx_lead_form_questions_target_entity
  ON public.lead_form_questions (lead_form_id, target_entity);