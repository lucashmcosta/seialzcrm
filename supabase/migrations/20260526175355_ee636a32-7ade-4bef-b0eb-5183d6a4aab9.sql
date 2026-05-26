
-- v2.1: conversation_stage + index for cohort analysis
ALTER TABLE public.message_analyses
  ADD COLUMN IF NOT EXISTS conversation_stage text;

-- Soft validation (trigger, not CHECK — keeps v1/v2 rows compatible)
CREATE OR REPLACE FUNCTION public.validate_message_analysis_v21()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.conversation_stage IS NOT NULL
     AND NEW.conversation_stage NOT IN (
       'discovery','qualification','objection','negotiation',
       'closing','post_sale','abandoned','unknown'
     ) THEN
    RAISE EXCEPTION 'invalid conversation_stage: %', NEW.conversation_stage;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_message_analysis_v21 ON public.message_analyses;
CREATE TRIGGER trg_validate_message_analysis_v21
BEFORE INSERT OR UPDATE ON public.message_analyses
FOR EACH ROW EXECUTE FUNCTION public.validate_message_analysis_v21();

CREATE INDEX IF NOT EXISTS idx_message_analyses_stage_org_version
  ON public.message_analyses (organization_id, analysis_version, conversation_stage)
  WHERE conversation_stage IS NOT NULL;
