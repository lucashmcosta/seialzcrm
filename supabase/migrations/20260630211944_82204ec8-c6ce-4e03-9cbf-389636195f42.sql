
-- =====================================================================
-- Indexes for the Inbox v2 scope queries
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_message_threads_org_status_last_msg
  ON public.message_threads (organization_id, status, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_message_threads_org_resolved
  ON public.message_threads (organization_id, resolved_at DESC)
  WHERE status = 'resolved';

CREATE INDEX IF NOT EXISTS idx_message_threads_org_assigned_status_last_msg
  ON public.message_threads (organization_id, assigned_user_id, status, last_message_at DESC NULLS LAST);

-- =====================================================================
-- rpc_list_inbox_threads — same scope rule as fetchScopeB + fetchScopeC
-- Returns SETOF jsonb shaped exactly like InboxScopedThread on the client.
-- SECURITY INVOKER so RLS on message_threads / contacts / endpoints
-- continues to apply naturally to whoever calls it.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_list_inbox_threads(
  p_organization_id uuid,
  p_tab text,
  p_only_mine boolean,
  p_assigned_user_id uuid,
  p_resolved_since timestamptz,
  p_include_service_endpoints boolean,
  p_limit int DEFAULT 200
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.id, t.contact_id, t.channel, t.status, t.priority,
      t.assigned_user_id, t.assigned_at, t.first_response_at,
      t.sla_first_response_target_at, t.sla_resolution_target_at,
      t.last_message_at, t.last_message_content, t.last_message_direction,
      t.resolved_at, t.last_inbound_at, t.whatsapp_last_inbound_at,
      t.last_routing_decision, t.organization_id, t.primary_endpoint_id,
      c.full_name        AS c_name,
      c.phone            AS c_phone,
      c.lifecycle_stage  AS c_lifecycle,
      e.purpose          AS e_purpose,
      e.external_address AS e_addr,
      e.provider         AS e_provider
    FROM public.message_threads t
    INNER JOIN public.contacts c
            ON c.id = t.contact_id
    LEFT JOIN public.communication_endpoints e
           ON e.id = t.primary_endpoint_id
    WHERE t.organization_id = p_organization_id
      AND (
            (p_tab = 'active'         AND t.status IN ('open','in_progress'))
         OR (p_tab = 'waiting'        AND t.status = 'awaiting_client')
         OR (p_tab = 'resolved_today' AND t.status = 'resolved'
                                      AND t.resolved_at >= p_resolved_since)
      )
      AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)
      AND (
        -- Scope B: customer lifecycle, exclude commercial/vendor_personal
        (c.lifecycle_stage = 'customer'
         AND (e.purpose IS NULL OR e.purpose NOT IN ('commercial','vendor_personal')))
        OR
        -- Scope C (opt-in): endpoint purpose = customer_service
        (p_include_service_endpoints AND e.purpose = 'customer_service')
      )
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'id', id,
    'contact_id', contact_id,
    'channel', channel,
    'status', status,
    'priority', priority,
    'assigned_user_id', assigned_user_id,
    'assigned_at', assigned_at,
    'first_response_at', first_response_at,
    'sla_first_response_target_at', sla_first_response_target_at,
    'sla_resolution_target_at', sla_resolution_target_at,
    'last_message_at', last_message_at,
    'last_message_content', last_message_content,
    'last_message_direction', last_message_direction,
    'resolved_at', resolved_at,
    'last_inbound_at', last_inbound_at,
    'whatsapp_last_inbound_at', whatsapp_last_inbound_at,
    'last_routing_decision', last_routing_decision,
    'organization_id', organization_id,
    'primary_endpoint_id', primary_endpoint_id,
    'contact', jsonb_build_object(
      'id', contact_id,
      'name', c_name,
      'phone', c_phone,
      'lifecycle_stage', c_lifecycle
    ),
    'primary_endpoint', CASE
      WHEN primary_endpoint_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', primary_endpoint_id,
        'purpose', e_purpose,
        'external_address', e_addr,
        'provider', e_provider
      )
    END
  )
  FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_list_inbox_threads(uuid, text, boolean, uuid, timestamptz, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_inbox_threads(uuid, text, boolean, uuid, timestamptz, boolean, int) TO service_role;

-- =====================================================================
-- rpc_inbox_queue_counts — aggregated counts in a single round-trip
-- Same scope rule. Returns true counts (no 200-row cap, since the
-- previous behaviour silently truncated and also returned 0 on timeout).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_inbox_queue_counts(
  p_organization_id uuid,
  p_only_mine boolean,
  p_assigned_user_id uuid,
  p_resolved_since timestamptz,
  p_include_service_endpoints boolean
)
RETURNS TABLE (active bigint, waiting bigint, resolved_today bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT t.status, t.resolved_at
    FROM public.message_threads t
    INNER JOIN public.contacts c
            ON c.id = t.contact_id
    LEFT JOIN public.communication_endpoints e
           ON e.id = t.primary_endpoint_id
    WHERE t.organization_id = p_organization_id
      AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)
      AND (
        (c.lifecycle_stage = 'customer'
         AND (e.purpose IS NULL OR e.purpose NOT IN ('commercial','vendor_personal')))
        OR
        (p_include_service_endpoints AND e.purpose = 'customer_service')
      )
      AND (
        t.status IN ('open','in_progress','awaiting_client')
        OR (t.status = 'resolved' AND t.resolved_at >= p_resolved_since)
      )
  )
  SELECT
    COUNT(*) FILTER (WHERE status IN ('open','in_progress'))                            AS active,
    COUNT(*) FILTER (WHERE status = 'awaiting_client')                                  AS waiting,
    COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= p_resolved_since)     AS resolved_today
  FROM scoped;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_inbox_queue_counts(uuid, boolean, uuid, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_inbox_queue_counts(uuid, boolean, uuid, timestamptz, boolean) TO service_role;
