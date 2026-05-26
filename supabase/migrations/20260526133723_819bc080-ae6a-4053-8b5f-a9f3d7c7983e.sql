
UPDATE public.intelligence_jobs
SET target_action='intelligence.analyze_message'
WHERE target_action='analyze_message';

UPDATE public.intelligence_jobs
SET target_action='intelligence.transcribe_audio'
WHERE target_action='transcribe_audio';

UPDATE public.intelligence_jobs
SET status='pending', last_error=NULL, attempts=0,
    next_run_at=now() + (random()*120 || ' seconds')::interval,
    completed_at=NULL
WHERE status='permanent_failure'
  AND last_error LIKE 'no handler%';
