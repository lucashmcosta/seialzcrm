DELETE FROM integration_audit_logs WHERE integration_slug='test-outbox';
DELETE FROM integration_jobs WHERE integration_slug='test-outbox';
DELETE FROM integration_events WHERE event_type='test-outbox.run';
DELETE FROM integration_subscriptions WHERE integration_slug='test-outbox';