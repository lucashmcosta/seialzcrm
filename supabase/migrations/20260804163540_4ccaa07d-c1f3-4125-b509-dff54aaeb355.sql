CREATE OR REPLACE FUNCTION public.fn_outbox_health_summary_internal()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending',              (SELECT count(*) FROM integration_jobs WHERE status='pending'),
    'running',              (SELECT count(*) FROM integration_jobs WHERE status='running'),
    'running_stuck_5m',     (SELECT count(*) FROM integration_jobs WHERE status='running' AND started_at < now() - interval '5 minutes'),
    'failed',               (SELECT count(*) FROM integration_jobs WHERE status='failed'),
    'dead_letter',          (SELECT count(*) FROM integration_jobs WHERE status='dead_letter'),
    'success_24h',          (SELECT count(*) FROM integration_jobs WHERE status='success' AND completed_at > now() - interval '24 hours'),
    'failed_24h',           (SELECT count(*) FROM integration_jobs WHERE status IN ('failed','dead_letter') AND last_error_at > now() - interval '24 hours'),
    'subscriptions_active', (SELECT count(*) FROM integration_subscriptions WHERE is_active=true),
    'subscriptions_paused', (SELECT count(*) FROM integration_subscriptions WHERE is_active=false OR (paused_until IS NOT NULL AND paused_until > now())),
    -- Sinal de vida: heartbeat dedicado do worker (gravado mesmo com fila vazia).
    -- Fallback transitorio para a trilha de auditoria por job, valido apenas ate
    -- o primeiro heartbeat do worker novo ser gravado.
    'worker_last_run_at',   greatest(
                              (SELECT last_run_at FROM outbox_system_heartbeats WHERE component='integration-worker'),
                              (SELECT max(created_at) FROM integration_audit_logs WHERE actor='integration-worker')
                            ),
    'worker_last_detail',   (SELECT last_detail FROM outbox_system_heartbeats WHERE component='integration-worker'),
    'reaper_last_run_at',   (SELECT last_run_at FROM outbox_system_heartbeats WHERE component='reaper'),
    'generated_at',         now()
  );
$$;