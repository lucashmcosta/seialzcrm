
-- Migration 1 (retry 2): usa is_admin_user() em vez de has_role

CREATE TABLE IF NOT EXISTS public.message_thread_merge_audit (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id             uuid NOT NULL,
  organization_id      uuid NOT NULL,
  contact_id           uuid NOT NULL,
  primary_endpoint_id  uuid,
  business_context     text,
  winner_thread_id     uuid NOT NULL,
  loser_thread_id      uuid NOT NULL,
  loser_prev_status    text,
  moved_messages       integer NOT NULL DEFAULT 0,
  moved_reads          integer NOT NULL DEFAULT 0,
  moved_assign_hist    integer NOT NULL DEFAULT 0,
  moved_response_times integer NOT NULL DEFAULT 0,
  moved_scheduled      integer NOT NULL DEFAULT 0,
  moved_tasks          integer NOT NULL DEFAULT 0,
  moved_ai_agent_logs  integer NOT NULL DEFAULT 0,
  moved_ai_inter_logs  integer NOT NULL DEFAULT 0,
  loser_snapshot       jsonb NOT NULL,
  winner_snapshot      jsonb NOT NULL,
  executed_at          timestamptz NOT NULL DEFAULT now(),
  unmerged_at          timestamptz,
  UNIQUE (loser_thread_id)
);

GRANT SELECT ON public.message_thread_merge_audit TO authenticated;
GRANT ALL    ON public.message_thread_merge_audit TO service_role;

ALTER TABLE public.message_thread_merge_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read merge audit" ON public.message_thread_merge_audit;
CREATE POLICY "admins read merge audit"
  ON public.message_thread_merge_audit
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS merged_into_thread_id uuid
    REFERENCES public.message_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mt_merged_into
  ON public.message_threads(merged_into_thread_id)
  WHERE merged_into_thread_id IS NOT NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS merged_from_thread_id uuid;

CREATE INDEX IF NOT EXISTS idx_messages_merged_from
  ON public.messages(merged_from_thread_id)
  WHERE merged_from_thread_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.merge_message_threads(
  p_winner uuid, p_loser uuid, p_batch uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_w  message_threads%ROWTYPE;
  v_l  message_threads%ROWTYPE;
  v_mv int := 0; v_rd int := 0; v_ah int := 0; v_rt int := 0;
  v_sc int := 0; v_tk int := 0; v_al int := 0; v_il int := 0;
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
    RAISE EXCEPTION 'merge_message_threads: thread not found (winner=%, loser=%)', p_winner, p_loser;
  END IF;

  IF v_l.merged_into_thread_id IS NOT NULL THEN RETURN; END IF;

  IF v_w.organization_id <> v_l.organization_id
     OR v_w.contact_id   <> v_l.contact_id
     OR v_w.channel      <> v_l.channel
     OR COALESCE(v_w.primary_endpoint_id::text, '') <> COALESCE(v_l.primary_endpoint_id::text, '')
     OR COALESCE(v_w.business_context, '')          <> COALESCE(v_l.business_context, '')
  THEN
    RAISE EXCEPTION 'merge_message_threads refused: grouping key mismatch (loser=% winner=%)', p_loser, p_winner;
  END IF;

  WITH u AS (
    UPDATE public.messages
       SET merged_from_thread_id = p_loser, thread_id = p_winner
     WHERE thread_id = p_loser AND merged_from_thread_id IS NULL
    RETURNING 1
  ) SELECT count(*) INTO v_mv FROM u;

  WITH u AS (UPDATE public.message_thread_reads     SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1)
    SELECT count(*) INTO v_rd FROM u;
  WITH u AS (UPDATE public.thread_assignment_history SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1)
    SELECT count(*) INTO v_ah FROM u;
  WITH u AS (UPDATE public.message_response_times   SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1)
    SELECT count(*) INTO v_rt FROM u;
  WITH u AS (UPDATE public.scheduled_messages       SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1)
    SELECT count(*) INTO v_sc FROM u;
  WITH u AS (UPDATE public.tasks                    SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1)
    SELECT count(*) INTO v_tk FROM u;
  WITH u AS (UPDATE public.ai_agent_logs            SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1)
    SELECT count(*) INTO v_al FROM u;
  WITH u AS (UPDATE public.ai_interaction_logs      SET thread_id = p_winner WHERE thread_id = p_loser RETURNING 1)
    SELECT count(*) INTO v_il FROM u;

  UPDATE public.message_threads
     SET status = 'closed', merged_into_thread_id = p_winner,
         resolved_at = COALESCE(resolved_at, now()), updated_at = now()
   WHERE id = p_loser;

  WITH last_real AS (
    SELECT id, content, direction, sent_at FROM public.messages
     WHERE thread_id = p_winner
       AND direction IN ('inbound','outbound')
       AND (is_internal_note IS NULL OR is_internal_note = false)
       AND deleted_at IS NULL
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
    p_batch, v_w.organization_id, v_w.contact_id, v_w.primary_endpoint_id, v_w.business_context,
    p_winner, p_loser, v_l.status,
    v_mv, v_rd, v_ah, v_rt, v_sc, v_tk, v_al, v_il,
    to_jsonb(v_l), to_jsonb(v_w)
  );
END $$;

REVOKE ALL ON FUNCTION public.merge_message_threads(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_message_threads(uuid, uuid, uuid) TO service_role;

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
   WHERE thread_id = v_winner AND changed_at BETWEEN v_loser_created AND v_cutoff;
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
  -- message_thread_reads não é revertido (sem snapshot por-usuário); afeta só badge.

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
GRANT EXECUTE ON FUNCTION public.unmerge_message_thread(uuid) TO service_role;
