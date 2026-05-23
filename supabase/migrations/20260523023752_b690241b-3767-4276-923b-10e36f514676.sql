-- Seed Outbox validation test data
DO $$
DECLARE
  v_org uuid := 'b246ef6f-6242-4011-a112-6d8783d2896a';
  v_sub uuid;
  v_evt uuid;
  v_mode text;
BEGIN
  INSERT INTO integration_subscriptions (organization_id, integration_slug, event_type, target_action, is_active, config)
  VALUES (v_org, 'test-outbox', 'test-outbox.run', 'run', true, '{}'::jsonb)
  RETURNING id INTO v_sub;

  FOREACH v_mode IN ARRAY ARRAY['success','retryable','permanent'] LOOP
    INSERT INTO integration_events (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status)
    VALUES (v_org, 'test', gen_random_uuid(), 'test-outbox.run',
            jsonb_build_object('mode', v_mode),
            'test-outbox-' || v_mode || '-' || gen_random_uuid()::text,
            'published')
    RETURNING id INTO v_evt;

    INSERT INTO integration_jobs (organization_id, event_id, subscription_id, integration_slug, target_action, payload, idempotency_key, status, max_attempts, next_run_at)
    VALUES (v_org, v_evt, v_sub, 'test-outbox', 'run',
            jsonb_build_object('mode', v_mode),
            'job-test-outbox-' || v_mode || '-' || gen_random_uuid()::text,
            'pending', 3, now());
  END LOOP;
END$$;