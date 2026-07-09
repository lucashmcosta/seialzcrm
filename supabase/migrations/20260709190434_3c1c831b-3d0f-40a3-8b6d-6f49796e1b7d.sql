
WITH picked AS (
  SELECT id FROM intelligence_jobs
  WHERE organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
    AND target_action='intelligence.analyze_message'
    AND status='permanent_failure'
    AND last_error='ai_failure'
  ORDER BY last_error_at DESC
  LIMIT 500
)
UPDATE intelligence_jobs j
SET status='pending',
    attempts=0,
    next_run_at=now(),
    last_error=NULL,
    last_error_at=NULL,
    external_response=NULL,
    started_at=NULL,
    completed_at=NULL
FROM picked
WHERE j.id=picked.id;
