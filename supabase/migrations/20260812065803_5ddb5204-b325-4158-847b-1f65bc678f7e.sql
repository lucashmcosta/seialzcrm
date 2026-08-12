-- 1) coluna de ordem monotônica
CREATE SEQUENCE IF NOT EXISTS public.message_thread_merge_audit_merge_seq_seq;

ALTER TABLE public.message_thread_merge_audit
  ADD COLUMN IF NOT EXISTS merge_seq bigint;

UPDATE public.message_thread_merge_audit a
   SET merge_seq = s.rn
  FROM (SELECT id, row_number() OVER (ORDER BY executed_at, id) AS rn
          FROM public.message_thread_merge_audit) s
 WHERE a.id = s.id AND a.merge_seq IS NULL;

SELECT setval('public.message_thread_merge_audit_merge_seq_seq',
              GREATEST(COALESCE((SELECT max(merge_seq) FROM public.message_thread_merge_audit), 0), 1));

ALTER TABLE public.message_thread_merge_audit
  ALTER COLUMN merge_seq SET DEFAULT nextval('public.message_thread_merge_audit_merge_seq_seq');

ALTER TABLE public.message_thread_merge_audit
  ALTER COLUMN merge_seq SET NOT NULL;

ALTER SEQUENCE public.message_thread_merge_audit_merge_seq_seq
  OWNED BY public.message_thread_merge_audit.merge_seq;

CREATE UNIQUE INDEX IF NOT EXISTS message_thread_merge_audit_merge_seq_uidx
  ON public.message_thread_merge_audit (merge_seq);

CREATE INDEX IF NOT EXISTS message_thread_merge_audit_winner_batch_seq_idx
  ON public.message_thread_merge_audit (winner_thread_id, batch_id, merge_seq);

-- 2) replay ordenado por merge_seq
CREATE OR REPLACE FUNCTION public.fn_replay_sales_merge_state(
  p_baseline jsonb, p_audit_ids uuid[],
  OUT o_status text, OUT o_assignee uuid,
  OUT o_assigned_at timestamp with time zone, OUT o_resolved_at timestamp with time zone)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_last_at timestamptz;
  v_loser_last timestamptz;
  v_prev uuid;
BEGIN
  o_status      := p_baseline->>'status';
  o_assignee    := NULLIF(p_baseline->>'assigned_user_id','')::uuid;
  o_assigned_at := NULLIF(p_baseline->>'assigned_at','')::timestamptz;
  o_resolved_at := NULLIF(p_baseline->>'resolved_at','')::timestamptz;
  v_last_at     := COALESCE(NULLIF(p_baseline->>'last_message_at','')::timestamptz,
                            NULLIF(p_baseline->>'created_at','')::timestamptz);

  IF p_audit_ids IS NULL OR array_length(p_audit_ids,1) IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT a.executed_at, a.loser_snapshot
      FROM public.message_thread_merge_audit a
     WHERE a.id = ANY(p_audit_ids)
     ORDER BY a.merge_seq
  LOOP
    v_loser_last := COALESCE(NULLIF(r.loser_snapshot->>'last_message_at','')::timestamptz,
                             NULLIF(r.loser_snapshot->>'created_at','')::timestamptz);
    v_prev := o_assignee;

    IF v_loser_last IS NOT NULL AND (v_last_at IS NULL OR v_loser_last > v_last_at) THEN
      o_assignee := COALESCE(NULLIF(r.loser_snapshot->>'assigned_user_id','')::uuid, o_assignee);
    ELSE
      o_assignee := COALESCE(o_assignee, NULLIF(r.loser_snapshot->>'assigned_user_id','')::uuid);
    END IF;

    IF o_assignee IS DISTINCT FROM v_prev THEN
      o_assigned_at := r.executed_at;
    END IF;

    IF public.sales_thread_status_rank(r.loser_snapshot->>'status')
       > public.sales_thread_status_rank(o_status) THEN
      o_status := r.loser_snapshot->>'status';
    END IF;

    IF o_status IN ('open','in_progress','awaiting_client') THEN
      o_resolved_at := NULL;
    END IF;

    v_last_at := GREATEST(COALESCE(v_last_at, v_loser_last), COALESCE(v_loser_last, v_last_at));
  END LOOP;
END $function$;

-- 3) merge: executed_at real (clock_timestamp) + ordenacao por merge_seq
CREATE OR REPLACE FUNCTION public.merge_sales_threads(p_winner uuid, p_loser uuid, p_batch uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_w message_threads%ROWTYPE;
  v_l message_threads%ROWTYPE;
  v_mv int := 0; v_rd int := 0; v_ah int := 0; v_rt int := 0;
  v_sc int := 0; v_tk int := 0; v_al int := 0; v_il int := 0;
  v_final_assignee uuid; v_prev_assignee uuid; v_status text;
  v_other_batch uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_winner IS NULL OR p_loser IS NULL OR p_winner = p_loser THEN RETURN; END IF;
  IF p_batch IS NULL THEN RAISE EXCEPTION 'MERGE_BATCH_REQUIRED'; END IF;

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

  -- 0a) auditoria legada em QUALQUER papel impede o contrato SALES_V2
  IF EXISTS (
    SELECT 1 FROM public.message_thread_merge_audit a
     WHERE (a.winner_thread_id IN (p_winner, p_loser) OR a.loser_thread_id IN (p_winner, p_loser))
       AND COALESCE(a.winner_snapshot->>'_merge_kind','') <> 'SALES_V2'
  ) THEN
    RAISE EXCEPTION 'MERGE_LEGACY_AUDIT_PRESENT (winner=%, loser=%)', p_winner, p_loser;
  END IF;

  -- 0b) invariante de batch ativo
  SELECT a.batch_id INTO v_other_batch
    FROM public.message_thread_merge_audit a
   WHERE a.winner_thread_id = p_winner
     AND a.unmerged_at IS NULL
     AND COALESCE(a.winner_snapshot->>'_merge_kind','') = 'SALES_V2'
     AND a.batch_id <> p_batch
   ORDER BY a.merge_seq
   LIMIT 1;
  IF v_other_batch IS NOT NULL THEN
    RAISE EXCEPTION 'MERGE_ACTIVE_BATCH_CONFLICT (winner=%, active_batch=%, requested_batch=%)',
      p_winner, v_other_batch, p_batch;
  END IF;

  -- 0c) star-merge only
  IF EXISTS (
    SELECT 1 FROM public.message_thread_merge_audit a
     WHERE a.winner_thread_id = p_loser AND a.unmerged_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MERGE_CHAIN_NOT_ALLOWED (winner=%, loser=%)', p_winner, p_loser;
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

  WITH u AS (UPDATE public.message_thread_reads SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_rd FROM u;

  -- stamp determinístico ANTES de mover o historico de atribuicao
  UPDATE public.thread_assignment_history
     SET metadata = COALESCE(metadata,'{}'::jsonb)
                    || jsonb_build_object('merge_origin_thread_id', p_loser::text,
                                          'merge_batch_id', p_batch::text)
   WHERE thread_id = p_loser;

  WITH u AS (UPDATE public.thread_assignment_history SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_ah FROM u;
  WITH u AS (UPDATE public.message_response_times    SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_rt FROM u;
  WITH u AS (UPDATE public.scheduled_messages        SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_sc FROM u;
  WITH u AS (UPDATE public.tasks                     SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_tk FROM u;
  WITH u AS (UPDATE public.ai_agent_logs             SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_al FROM u;
  WITH u AS (UPDATE public.ai_interaction_logs       SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1) SELECT count(*) INTO v_il FROM u;

  UPDATE public.message_threads
     SET status = 'closed', merged_into_thread_id = p_winner,
         resolved_at = COALESCE(resolved_at, v_now), updated_at = v_now
   WHERE id = p_loser;

  v_status := CASE WHEN public.sales_thread_status_rank(v_l.status) > public.sales_thread_status_rank(v_w.status)
                   THEN v_l.status ELSE v_w.status END;

  UPDATE public.message_threads t
     SET assigned_user_id = v_final_assignee,
         assigned_at = CASE WHEN v_final_assignee IS DISTINCT FROM v_prev_assignee THEN v_now ELSE t.assigned_at END,
         status = v_status,
         resolved_at = CASE WHEN v_status IN ('open','in_progress','awaiting_client') THEN NULL ELSE t.resolved_at END,
         updated_at = v_now
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
         updated_at = v_now
    FROM last_real lr WHERE t.id = p_winner;

  INSERT INTO public.message_thread_merge_audit (
    batch_id, organization_id, contact_id, primary_endpoint_id, business_context,
    winner_thread_id, loser_thread_id, loser_prev_status, executed_at,
    moved_messages, moved_reads, moved_assign_hist, moved_response_times,
    moved_scheduled, moved_tasks, moved_ai_agent_logs, moved_ai_inter_logs,
    loser_snapshot, winner_snapshot
  ) VALUES (
    p_batch, v_w.organization_id, v_w.contact_id, v_w.primary_endpoint_id, 'sales',
    p_winner, p_loser, v_l.status, v_now,
    v_mv, v_rd, v_ah, v_rt, v_sc, v_tk, v_al, v_il,
    to_jsonb(v_l) || jsonb_build_object('_merge_kind','SALES_V2'),
    to_jsonb(v_w) || jsonb_build_object('_merge_kind','SALES_V2')
  );
END $function$;

-- 4) unmerge: toda ordenacao de auditoria por merge_seq
CREATE OR REPLACE FUNCTION public.unmerge_message_thread(p_loser uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a  message_thread_merge_audit%ROWTYPE;
  v_winner uuid;
  v_cutoff timestamptz;
  v_loser_created timestamptz;
  v_is_sales boolean := false;
  v_batch uuid;
  v_baseline jsonb;
  v_ids_expected uuid[];
  v_ids_target uuid[];
  v_exp record;
  v_tgt record;
  v_cur_status text; v_cur_assignee uuid; v_cur_resolved timestamptz;
  v_stamped int := 0;
  v_active_remaining int := 0;
BEGIN
  SELECT * INTO a FROM public.message_thread_merge_audit
   WHERE loser_thread_id = p_loser AND unmerged_at IS NULL
   ORDER BY merge_seq DESC LIMIT 1;

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'unmerge_message_thread: no active audit row for loser %', p_loser;
  END IF;

  v_winner        := a.winner_thread_id;
  v_cutoff        := a.executed_at;
  v_loser_created := (a.loser_snapshot->>'created_at')::timestamptz;
  v_is_sales      := COALESCE(a.winner_snapshot->>'_merge_kind','') = 'SALES_V2';
  v_batch         := a.batch_id;

  IF v_winner < p_loser THEN
    PERFORM 1 FROM message_threads WHERE id = v_winner FOR UPDATE;
    PERFORM 1 FROM message_threads WHERE id = p_loser  FOR UPDATE;
  ELSE
    PERFORM 1 FROM message_threads WHERE id = p_loser  FOR UPDATE;
    PERFORM 1 FROM message_threads WHERE id = v_winner FOR UPDATE;
  END IF;

  IF v_is_sales THEN
    IF EXISTS (
      SELECT 1 FROM public.message_thread_merge_audit x
       WHERE (x.winner_thread_id IN (v_winner, p_loser) OR x.loser_thread_id IN (v_winner, p_loser))
         AND COALESCE(x.winner_snapshot->>'_merge_kind','') <> 'SALES_V2'
    ) THEN
      RAISE EXCEPTION 'UNMERGE_LEGACY_AUDIT_PRESENT (winner=%, loser=%)', v_winner, p_loser;
    END IF;

    SELECT x.winner_snapshot INTO v_baseline
      FROM public.message_thread_merge_audit x
     WHERE x.winner_thread_id = v_winner
       AND x.batch_id = v_batch
       AND COALESCE(x.winner_snapshot->>'_merge_kind','') = 'SALES_V2'
     ORDER BY x.merge_seq ASC LIMIT 1;

    SELECT array_agg(x.id ORDER BY x.merge_seq) INTO v_ids_expected
      FROM public.message_thread_merge_audit x
     WHERE x.winner_thread_id = v_winner
       AND x.batch_id = v_batch
       AND COALESCE(x.winner_snapshot->>'_merge_kind','') = 'SALES_V2'
       AND x.unmerged_at IS NULL;

    SELECT * INTO v_exp FROM public.fn_replay_sales_merge_state(v_baseline, v_ids_expected);

    SELECT t.status, t.assigned_user_id, t.resolved_at
      INTO v_cur_status, v_cur_assignee, v_cur_resolved
      FROM public.message_threads t WHERE t.id = v_winner;

    IF v_cur_status IS DISTINCT FROM v_exp.o_status
       OR v_cur_assignee IS DISTINCT FROM v_exp.o_assignee
       OR (v_cur_resolved IS NULL) IS DISTINCT FROM (v_exp.o_resolved_at IS NULL) THEN
      RAISE EXCEPTION 'UNMERGE_OPERATIONAL_STATE_CONFLICT (operational drift detected; may be product-driven, not necessarily manual) winner=% loser=% batch=% active_merges=% current status=%/assignee=%/resolved_null=% expected status=%/assignee=%/resolved_null=%',
        v_winner, p_loser, v_batch, COALESCE(array_length(v_ids_expected,1),0),
        v_cur_status, v_cur_assignee, (v_cur_resolved IS NULL),
        v_exp.o_status, v_exp.o_assignee, (v_exp.o_resolved_at IS NULL);
    END IF;
  END IF;

  UPDATE public.messages
     SET thread_id = p_loser, merged_from_thread_id = NULL
   WHERE merged_from_thread_id = p_loser AND thread_id = v_winner;

  IF v_is_sales THEN
    WITH u AS (
      UPDATE public.thread_assignment_history
         SET thread_id = p_loser,
             metadata = (metadata - 'merge_origin_thread_id') - 'merge_batch_id'
       WHERE thread_id = v_winner
         AND metadata->>'merge_origin_thread_id' = p_loser::text
      RETURNING 1
    ) SELECT count(*) INTO v_stamped FROM u;

    IF COALESCE(a.moved_assign_hist,0) <> v_stamped THEN
      RAISE EXCEPTION 'UNMERGE_ASSIGNMENT_STAMP_MISSING (winner=%, loser=%, expected=%, found=%)',
        v_winner, p_loser, COALESCE(a.moved_assign_hist,0), v_stamped;
    END IF;
  ELSE
    UPDATE public.thread_assignment_history SET thread_id = p_loser
     WHERE thread_id = v_winner AND created_at BETWEEN v_loser_created AND v_cutoff;
  END IF;

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

  UPDATE public.message_thread_merge_audit SET unmerged_at = clock_timestamp() WHERE id = a.id;

  IF v_is_sales THEN
    SELECT array_agg(x.id ORDER BY x.merge_seq) INTO v_ids_target
      FROM public.message_thread_merge_audit x
     WHERE x.winner_thread_id = v_winner
       AND x.batch_id = v_batch
       AND COALESCE(x.winner_snapshot->>'_merge_kind','') = 'SALES_V2'
       AND x.unmerged_at IS NULL;

    v_active_remaining := COALESCE(array_length(v_ids_target,1),0);

    SELECT * INTO v_tgt FROM public.fn_replay_sales_merge_state(v_baseline, v_ids_target);

    UPDATE public.message_threads t
       SET status = v_tgt.o_status,
           assigned_user_id = v_tgt.o_assignee,
           assigned_at = v_tgt.o_assigned_at,
           resolved_at = v_tgt.o_resolved_at,
           updated_at = now()
     WHERE t.id = v_winner;

    IF v_tgt.o_assignee IS DISTINCT FROM v_cur_assignee THEN
      INSERT INTO public.thread_assignment_history (organization_id, thread_id, action_type,
        from_user_id, to_user_id, reason, metadata)
      VALUES (a.organization_id, v_winner, 'auto_reassign', v_cur_assignee, v_tgt.o_assignee,
        'UNMERGE_SALES_V2',
        jsonb_build_object('batch_id', v_batch, 'loser_thread_id', p_loser,
                           'previous_assignee', v_cur_assignee,
                           'recalculated_assignee', v_tgt.o_assignee,
                           'active_merges_remaining', v_active_remaining));
    END IF;
  END IF;

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
END $function$;