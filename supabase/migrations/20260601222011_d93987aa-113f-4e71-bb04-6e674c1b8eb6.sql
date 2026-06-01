UPDATE public.message_threads
SET assigned_user_id = 'f306fa3c-898c-4e50-b40b-2aadd415c9ff',
    assigned_at = now(),
    last_routing_decision = jsonb_build_object(
      'action','take_over',
      'by_user_id','f306fa3c-898c-4e50-b40b-2aadd415c9ff',
      'reason','test_thread_handover',
      'at', now()
    )
WHERE id = '78d33d95-13ff-48a2-9b2c-c58462944a3d';