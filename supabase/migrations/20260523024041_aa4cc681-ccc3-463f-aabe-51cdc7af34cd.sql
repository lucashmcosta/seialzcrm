DO $$
DECLARE
  v_org uuid := 'b246ef6f-6242-4011-a112-6d8783d2896a';
  v_sub uuid;
  v_evt uuid;
BEGIN
  SELECT id INTO v_sub FROM integration_subscriptions WHERE integration_slug='test-outbox' LIMIT 1;

  INSERT INTO integration_events (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status)
  VALUES (v_org, 'test', gen_random_uuid(), 'test-outbox.run',
          jsonb_build_object('mode','stuck'),
          'test-outbox-stuck-' || gen_random_uuid()::text,
          'published')
  RETURNING id INTO v_evt;

  INSERT INTO integration_jobs (organization_id, event_id, subscription_id, integration_slug, target_action, payload, idempotency_key, status, attempts, max_attempts, next_run_at, started_at)
  VALUES (v_org, v_evt, v_sub, 'test-outbox', 'run',
          jsonb_build_object('mode','stuck'),
          'job-test-outbox-stuck-' || gen_random_uuid()::text,
          'running', 1, 3, now(), now() - interval '10 minutes');
END$$;

SELECT public.fn_reap_stuck_jobs(5) AS reaped;