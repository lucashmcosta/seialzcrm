
-- Runtime smoke tests Migration 2A (sem DDL, sem objetos)
DO $$
DECLARE
  v_org    uuid := '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
  v_thread uuid := '54929c79-900a-45f9-9e01-4a14acf3bf0f';
  v_orig   uuid := '3ee6ef05-2987-488f-90f8-9b3511957170';  -- Victoria
  v_new    uuid := '36497cc4-5a24-46ad-8b80-718b5e1954b3';  -- Tamires
  r_t1     uuid;
  r_t2a    uuid;
  r_t2b    uuid;
  r_t3     uuid;
  cnt_before int;
  cnt_after_update int;
  cnt_after_revert int;
  cur_after_update uuid;
  cur_after_revert uuid;
BEGIN
  SELECT public.assign_round_robin(v_org)              INTO r_t1;
  SELECT public.assign_round_robin(v_org, NULL)        INTO r_t2a;
  SELECT public.assign_round_robin(v_org, '   ')       INTO r_t2b;
  SELECT public.assign_round_robin(v_org, 'customer_service') INTO r_t3;

  RAISE NOTICE 'T1  result: %', r_t1;
  RAISE NOTICE 'T2a result: %', r_t2a;
  RAISE NOTICE 'T2b result: %', r_t2b;
  RAISE NOTICE 'T3  result: %', r_t3;

  SELECT count(*) INTO cnt_before FROM public.thread_assignment_history WHERE thread_id = v_thread;
  RAISE NOTICE 'T4 history_count_before: %', cnt_before;

  -- T4: UPDATE manual sem last_routing_decision -> nao deve gerar linha
  UPDATE public.message_threads SET assigned_user_id = v_new WHERE id = v_thread;
  SELECT assigned_user_id, (SELECT count(*) FROM public.thread_assignment_history WHERE thread_id = v_thread)
    INTO cur_after_update, cnt_after_update
  FROM public.message_threads WHERE id = v_thread;
  RAISE NOTICE 'T4 after UPDATE: assignee=% history_count=%', cur_after_update, cnt_after_update;

  -- Revert imediato (tambem sem last_routing_decision)
  UPDATE public.message_threads SET assigned_user_id = v_orig WHERE id = v_thread;
  SELECT assigned_user_id, (SELECT count(*) FROM public.thread_assignment_history WHERE thread_id = v_thread)
    INTO cur_after_revert, cnt_after_revert
  FROM public.message_threads WHERE id = v_thread;
  RAISE NOTICE 'T4 after REVERT: assignee=% history_count=%', cur_after_revert, cnt_after_revert;
END $$;
