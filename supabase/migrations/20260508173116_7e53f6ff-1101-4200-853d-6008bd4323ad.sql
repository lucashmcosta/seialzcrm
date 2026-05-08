
-- 1a. Recriar view com security_invoker
DROP VIEW IF EXISTS public.v_entity_sync_status;
CREATE VIEW public.v_entity_sync_status
  WITH (security_invoker = on) AS
SELECT
  organization_id,
  internal_id,
  entity_type,
  CASE
    WHEN bool_or(sync_status = 'error')   THEN 'error'
    WHEN bool_or(sync_status = 'drift')   THEN 'drift'
    WHEN bool_or(sync_status = 'pending') THEN 'pending'
    ELSE 'synced'
  END AS worst_status,
  max(last_synced_at) AS last_synced_at
FROM public.external_mappings
GROUP BY organization_id, internal_id, entity_type;

-- 1b. Hardening de search_path nas funções da Phase 1
ALTER FUNCTION public.fn_publish_integration_event()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_fanout_event()                                  SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_schedule_retry(uuid, text)                      SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_retry_integration_job(uuid)                    SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_resolve_integration_job_manually(uuid, text)   SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_dismiss_integration_job(uuid)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_update_integration_job_payload(uuid, jsonb)    SET search_path = public, pg_temp;
ALTER FUNCTION public.can_manage_integrations_in_org(uuid)               SET search_path = public, pg_temp;
