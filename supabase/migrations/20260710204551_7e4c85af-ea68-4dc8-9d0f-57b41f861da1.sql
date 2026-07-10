
-- Lote 3 de homologação Worker v2: reenfileirar 5.000 jobs mais recentes da Central Trabalhista
-- Proporção mantida ~76% analyze / 24% transcribe (baseado no backlog atual)
-- Não altera schema. Apenas DML de reset (status/attempts/next_run_at/...).

WITH analyze_target AS (
  SELECT id FROM public.intelligence_jobs
  WHERE organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
    AND target_action = 'intelligence.analyze_message'
    AND status = 'permanent_failure'
  ORDER BY created_at DESC
  LIMIT 3810
),
transcribe_target AS (
  SELECT id FROM public.intelligence_jobs
  WHERE organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
    AND target_action = 'intelligence.transcribe_audio'
    AND status = 'permanent_failure'
  ORDER BY created_at DESC
  LIMIT 1190
),
to_reset AS (
  SELECT id FROM analyze_target
  UNION ALL
  SELECT id FROM transcribe_target
)
UPDATE public.intelligence_jobs j
SET status = 'pending',
    attempts = 0,
    next_run_at = now(),
    started_at = NULL,
    completed_at = NULL,
    last_error = NULL,
    last_error_at = NULL,
    external_response = NULL,
    reclaim_count = 0,
    last_reclaim_at = NULL,
    last_reclaim_reason = NULL
FROM to_reset t
WHERE j.id = t.id;
