
ALTER TABLE public.message_analyses
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS is_template boolean,
  ADD COLUMN IF NOT EXISTS speaker_role text,
  ADD COLUMN IF NOT EXISTS message_quality_score integer;

-- Soft validation via trigger (CHECK constraints poderiam quebrar v1 rows nulas)
CREATE OR REPLACE FUNCTION public.validate_message_analysis_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.confidence IS NOT NULL AND NEW.confidence NOT IN ('low','medium','high') THEN
    RAISE EXCEPTION 'invalid confidence: %', NEW.confidence;
  END IF;
  IF NEW.speaker_role IS NOT NULL AND NEW.speaker_role NOT IN ('lead','seller','system','unknown') THEN
    RAISE EXCEPTION 'invalid speaker_role: %', NEW.speaker_role;
  END IF;
  IF NEW.message_quality_score IS NOT NULL AND (NEW.message_quality_score < 0 OR NEW.message_quality_score > 100) THEN
    RAISE EXCEPTION 'invalid message_quality_score: %', NEW.message_quality_score;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_message_analysis_v2 ON public.message_analyses;
CREATE TRIGGER trg_validate_message_analysis_v2
  BEFORE INSERT OR UPDATE ON public.message_analyses
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_analysis_v2();

-- Index for v2 lookups during backfill / comparison
CREATE INDEX IF NOT EXISTS idx_message_analyses_msg_version
  ON public.message_analyses(message_id, analysis_version);
CREATE INDEX IF NOT EXISTS idx_message_analyses_version_org
  ON public.message_analyses(analysis_version, organization_id);
