CREATE OR REPLACE FUNCTION public.unmerge_message_thread(p_loser uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  a  message_thread_merge_audit%ROWTYPE;
  v_winner uuid;
  v_cutoff timestamptz;
  v_loser_created timestamptz;
BEGIN
  SELECT * INTO a FROM public.message_thread_merge_audit
   WHERE loser_thread_id = p_loser AND unmerged_at IS NULL
   ORDER BY executed_at DESC LIMIT 1;

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'unmerge_message_thread: no active audit row for loser %', p_loser;
  END IF;

  v_winner        := a.winner_thread_id;
  v_cutoff        := a.executed_at;
  v_loser_created := (a.loser_snapshot->>'created_at')::timestamptz;

  IF v_winner < p_loser THEN
    PERFORM 1 FROM message_threads WHERE id = v_winner FOR UPDATE;
    PERFORM 1 FROM message_threads WHERE id = p_loser  FOR UPDATE;
  ELSE
    PERFORM 1 FROM message_threads WHERE id = p_loser  FOR UPDATE;
    PERFORM 1 FROM message_threads WHERE id = v_winner FOR UPDATE;
  END IF;

  UPDATE public.messages
     SET thread_id = p_loser, merged_from_thread_id = NULL
   WHERE merged_from_thread_id = p_loser AND thread_id = v_winner;

  UPDATE public.thread_assignment_history SET thread_id = p_loser
   WHERE thread_id = v_winner AND created_at BETWEEN v_loser_created AND v_cutoff;
  UPDATE public.message_response_times SET thread_id = p_loser
   WHERE thread_id = v_winner AND created_at BETWEEN v_loser_created AND v_cutoff;
  UPDATE public.scheduled_messages SET thread_id = p_loser
   WHERE thread_id = v_winner AND created_at BETWEEN v_loser_created AND v_cutoff;
  UPDATE public.tasks SET thread_id = p_loser
   WHERE thread_id = v_winner AND created_at BETWEEN v_loser_created AND v_cutoff;
  UPDATE public.ai_agent_logs SET thread_id = p_loser
   WHERE thread_id = v_winner AND created_at BETWEEN v_loser_created AND v_cutoff;
  UPDATE public.ai_interaction_logs SET thread_id = p_loser
   WHERE thread_id = v_winner AND created_at BETWEEN v_loser_created AND v_cutoff;

  UPDATE public.message_threads
     SET status = COALESCE(a.loser_prev_status, 'closed'),
         merged_into_thread_id = NULL,
         resolved_at = NULLIF((a.loser_snapshot->>'resolved_at'), '')::timestamptz,
         updated_at = now()
   WHERE id = p_loser;

  WITH last_real AS (
    SELECT id, content, direction, sent_at FROM public.messages
     WHERE thread_id = p_loser
       AND direction IN ('inbound','outbound')
       AND (is_internal_note IS NULL OR is_internal_note = false)
       AND deleted_at IS NULL
     ORDER BY sent_at DESC NULLS LAST, created_at DESC LIMIT 1
  )
  UPDATE public.message_threads t
     SET last_message_id = lr.id, last_message_at = lr.sent_at,
         last_message_content = lr.content, last_message_direction = lr.direction,
         updated_at = now()
    FROM last_real lr WHERE t.id = p_loser;

  UPDATE public.message_threads
     SET last_message_id = NULL, last_message_at = NULL,
         last_message_content = NULL, last_message_direction = NULL
   WHERE id = p_loser
     AND NOT EXISTS (
       SELECT 1 FROM public.messages
        WHERE thread_id = p_loser
          AND direction IN ('inbound','outbound')
          AND (is_internal_note IS NULL OR is_internal_note = false)
          AND deleted_at IS NULL
     );

  WITH last_real AS (
    SELECT id, content, direction, sent_at FROM public.messages
     WHERE thread_id = v_winner
       AND direction IN ('inbound','outbound')
       AND (is_internal_note IS NULL OR is_internal_note = false)
       AND deleted_at IS NULL
     ORDER BY sent_at DESC NULLS LAST, created_at DESC LIMIT 1
  )
  UPDATE public.message_threads t
     SET last_message_id = lr.id, last_message_at = lr.sent_at,
         last_message_content = lr.content, last_message_direction = lr.direction,
         updated_at = now()
    FROM last_real lr WHERE t.id = v_winner;

  UPDATE public.message_threads
     SET last_message_id = NULL, last_message_at = NULL,
         last_message_content = NULL, last_message_direction = NULL
   WHERE id = v_winner
     AND NOT EXISTS (
       SELECT 1 FROM public.messages
        WHERE thread_id = v_winner
          AND direction IN ('inbound','outbound')
          AND (is_internal_note IS NULL OR is_internal_note = false)
          AND deleted_at IS NULL
     );

  UPDATE public.message_thread_merge_audit SET unmerged_at = now() WHERE id = a.id;
END $$;

REVOKE ALL ON FUNCTION public.unmerge_message_thread(uuid) FROM PUBLIC;