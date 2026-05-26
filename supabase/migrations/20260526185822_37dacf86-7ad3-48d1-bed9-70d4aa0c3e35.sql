
UPDATE public.intelligence_jobs
SET status = 'permanent_failure',
    last_error = 'superseded by v2.1 backfill (canceled)'
WHERE organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND status = 'pending'
  AND target_action IN ('intelligence.analyze_message','intelligence.transcribe_audio')
  AND (payload->>'version' IS NULL OR payload->>'version' = 'v2.0.0');
