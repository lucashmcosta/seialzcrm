CREATE OR REPLACE FUNCTION public.merge_sales_threads(p_winner uuid, p_loser uuid, p_batch uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_w message_threads%ROWTYPE;
  v_l message_threads%ROWTYPE;
  v_mv int := 0; v_rd int := 0; v_ah int := 0; v_rt int := 0;
  v_sc int := 0; v_tk int := 0; v_al int := 0; v_il int := 0;
  v_final_assignee uuid; v_prev_assignee uuid; v_status text;
BEGIN
  IF p_winner IS NULL OR p_loser IS NULL OR p_winner = p_loser THEN RETURN; END IF;

  IF p_winner < p_loser THEN
    SELECT * INTO v_w FROM message_threads WHERE id = p_winner FOR UPDATE;
    SELECT * INTO v_l FROM message_threads WHERE id = p_loser  FOR UPDATE;
  ELSE
    SELECT * INTO v_l FROM message_threads WHERE id = p_loser  FOR UPDATE;
    SELECT * INTO v_w FROM message_threads WHERE id = p_winner FOR UPDATE;
  END IF;

  IF v_w.id IS NULL OR v_l.id IS NULL THEN
    RAISE EXCEPTION 'MERGE_THREAD_NOT_FOUND (winner=%, loser=%)', p_winner, p_loser;
  END IF;
  IF v_l.merged_into_thread_id IS NOT NULL THEN RETURN; END IF;
  IF v_w.merged_into_thread_id IS NOT NULL THEN
    RAISE EXCEPTION 'MERGE_WINNER_ALREADY_MERGED (winner=%)', p_winner;
  END IF;
  IF COALESCE(v_w.business_context,'') <> 'sales' OR COALESCE(v_l.business_context,'') <> 'sales' THEN
    RAISE EXCEPTION 'MERGE_NOT_SALES (winner=%, loser=%)', p_winner, p_loser;
  END IF;
  IF v_w.organization_id <> v_l.organization_id
     OR v_w.contact_id IS NULL OR v_l.contact_id IS NULL
     OR v_w.contact_id <> v_l.contact_id
     OR v_w.channel <> v_l.channel THEN
    RAISE EXCEPTION 'MERGE_KEY_MISMATCH (winner=%, loser=%)', p_winner, p_loser;
  END IF;
  IF v_l.created_at < v_w.created_at THEN
    RAISE EXCEPTION 'MERGE_WINNER_NOT_OLDEST (winner=%, loser=%)', p_winner, p_loser;
  END IF;

  v_prev_assignee := v_w.assigned_user_id;
  IF COALESCE(v_l.last_message_at, v_l.created_at) > COALESCE(v_w.last_message_at, v_w.created_at) THEN
    v_final_assignee := COALESCE(v_l.assigned_user_id, v_w.assigned_user_id);
  ELSE
    v_final_assignee := COALESCE(v_w.assigned_user_id, v_l.assigned_user_id);
  END IF;

  WITH u AS (
    UPDATE public.messages
       SET thread_id = p_winner,
           merged_from_thread_id = COALESCE(merged_from_thread_id, p_loser)
     WHERE thread_id = p_loser
    RETURNING 1
  ) SELECT count(*) INTO v_mv FROM u;

  UPDATE public.message_thread_reads w
     SET last_read_at = GREATEST(w.last_read_at, l.last_read_at)
    FROM public.message_thread_reads l
   WHERE w.thread_id = p_winner AND l.thread_id = p_loser AND l.user_id = w.user_id;
  DELETE FROM public.message_thread_reads l
   WHERE l.thread_id = p_loser
     AND EXISTS (SELECT 1 FROM public.message_thread_reads w
                  WHERE w.thread_id = p_winner AND w.user_id = l.user_id);

  WITH u AS (UPDATE public.message_thread_reads      SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_rd FROM u;
  WITH u AS (UPDATE public.thread_assignment_history SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_ah FROM u;
  WITH u AS (UPDATE public.message_response_times    SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_rt FROM u;
  WITH u AS (UPDATE public.scheduled_messages        SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_sc FROM u;
  WITH u AS (UPDATE public.tasks                     SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_tk FROM u;
  WITH u AS (UPDATE public.ai_agent_logs             SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_al FROM u;
  WITH u AS (UPDATE public.ai_interaction_logs       SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_il FROM u;

  UPDATE public.message_threads
     SET status = 'closed', merged_into_thread_id = p_winner,
         resolved_at = COALESCE(resolved_at, now()), updated_at = now()
   WHERE id = p_loser;

  v_status := CASE WHEN public.sales_thread_status_rank(v_l.status) > public.sales_thread_status_rank(v_w.status)
                   THEN v_l.status ELSE v_w.status END;

  UPDATE public.message_threads t
     SET assigned_user_id = v_final_assignee,
         assigned_at = CASE WHEN v_final_assignee IS DISTINCT FROM v_prev_assignee THEN now() ELSE t.assigned_at END,
         status = v_status,
         resolved_at = CASE WHEN v_status IN ('open','in_progress','awaiting_client') THEN NULL ELSE t.resolved_at END,
         updated_at = now()
   WHERE t.id = p_winner;

  IF v_final_assignee IS DISTINCT FROM v_prev_assignee THEN
    INSERT INTO public.thread_assignment_history (organization_id, thread_id, action_type, from_user_id, to_user_id, reason, metadata)
    VALUES (v_w.organization_id, p_winner, 'auto_reassign', v_prev_assignee, v_final_assignee, 'MERGE_SALES_V2',
            jsonb_build_object('batch_id', p_batch, 'loser_thread_id', p_loser));
  END IF;

  WITH last_real AS (
    SELECT id, content, direction, sent_at FROM public.messages
     WHERE thread_id = p_winner AND direction IN ('inbound','outbound')
       AND (is_internal_note IS NULL OR is_internal_note = false) AND deleted_at IS NULL
     ORDER BY sent_at DESC NULLS LAST, created_at DESC LIMIT 1
  )
  UPDATE public.message_threads t
     SET last_message_id = lr.id, last_message_at = lr.sent_at,
         last_message_content = lr.content, last_message_direction = lr.direction,
         updated_at = now()
    FROM last_real lr WHERE t.id = p_winner;

  INSERT INTO public.message_thread_merge_audit (
    batch_id, organization_id, contact_id, primary_endpoint_id, business_context,
    winner_thread_id, loser_thread_id, loser_prev_status,
    moved_messages, moved_reads, moved_assign_hist, moved_response_times,
    moved_scheduled, moved_tasks, moved_ai_agent_logs, moved_ai_inter_logs,
    loser_snapshot, winner_snapshot
  ) VALUES (
    p_batch, v_w.organization_id, v_w.contact_id, v_w.primary_endpoint_id, 'sales',
    p_winner, p_loser, v_l.status,
    v_mv, v_rd, v_ah, v_rt, v_sc, v_tk, v_al, v_il,
    to_jsonb(v_l), to_jsonb(v_w)
  );
END $function$;